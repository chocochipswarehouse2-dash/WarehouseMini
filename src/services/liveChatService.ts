/**
 * WMS Live Chat & Multi-User Discussion Room Service
 *
 * Architecture:
 * 1. Tier 1 (Permanent Device Storage): IndexedDB ('wms_live_chat_idb_v1') keeps 100% of historical messages locally (0 Egress).
 * 2. Tier 2 (Zero-Setup Cloud Hot Store): Uses existing 'public.wms_system_docs' table in Supabase (no new table required).
 * 3. Tier 3 (Google Drive CDN via GAS): Attachments are compressed client-side & uploaded to Google Drive (0 byte in Supabase).
 *    Old message batches (>150 msgs/room) are archived to Google Drive so history is never lost while keeping Supabase < 1 MB.
 * 4. Real-Time Engine: Supabase Realtime Presence (online users & typing) + Broadcast (instant messaging, read receipts ✓✓, edit/delete).
 * 5. Accountability Rules: Messages can only be edited or deleted by sender within 5 minutes AND before any other user reads them (✓).
 */

import { UserSession, WmsUser } from '../types';
import { getSupabaseClient, supabaseFetch, fetchWmsUsersFromSupabase } from './supabase';
import { uploadImageToGdrive } from './gdriveUpload';
import { isSuperadmin } from './permissions';
import { getUserPersonName } from '../utils/userResolver';
import { playNewTaskChime, vibrateDevice } from './audio';
import {
  showPushNotification,
  loadPersistedNotifiedOrderIds,
  savePersistedNotifiedOrderIds,
  syncNotifiedOrdersToServiceWorker,
} from './pushNotification';

export type ChatContextTagType = 'SKU' | 'SJ' | 'ORDER' | 'RETUR';

export interface ChatContextTag {
  type: ChatContextTagType;
  code: string;
  label?: string;
}

export interface ChatReadReceipt {
  username: string;
  name: string;
  read_at: string;
}

export interface ChatReplyQuote {
  id: string;
  sender_username: string;
  sender_name: string;
  text: string;
  attachment_url?: string;
}

export interface ChatOrderContext {
  order_id: string;
  store_name?: string;
  customer_name?: string;
  items_summary?: string;
  total_pcs?: number;
  status?: string;
  no_resi?: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_username: string;
  sender_name: string;
  sender_role: string;
  sender_store?: string;
  text: string;
  attachment_url?: string; // Strict Google Drive CDN link (https://lh3.googleusercontent.com/d/...)
  context_tags?: ChatContextTag[];
  order_context?: ChatOrderContext;
  mentions?: string[];
  reply_to?: ChatReplyQuote;
  created_at: string;
  read_by: ChatReadReceipt[];
  is_edited?: boolean;
  edited_at?: string;
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by?: string;
}

export interface ChatParticipantProfile {
  username: string;
  name: string;
  role: string;
  store_name?: string;
}

export interface ChatRoom {
  id: string;
  type: 'direct' | 'group';
  name: string;
  topic?: string;
  theme_color?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'purple';
  participants: string[]; // lowercase usernames
  participant_profiles: Record<string, ChatParticipantProfile>;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  last_message_id?: string;
  last_message_text?: string;
  last_message_sender?: string;
  last_message_sender_name?: string;
  last_message_at?: string;
  unread_by?: string[]; // lowercase usernames who have not read the latest messages
  unread_counts?: Record<string, number>; // per-user unread count
  archive_urls?: string[]; // Google Drive cold archive URLs for >150 historical messages
}

export interface OnlineUserPresence {
  username: string;
  name: string;
  role: string;
  store_name?: string;
  online_at: string;
  active_page?: string;
  typing_room_id?: string | null;
}

export const EDIT_DELETE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const HOT_MESSAGE_LIMIT_PER_ROOM = 150;
const ARCHIVE_BATCH_SIZE = 50;

const ROOMS_INDEX_DOC_KEY = 'wms_chat_rooms_index_v1';
const ROOM_MSGS_DOC_PREFIX = 'wms_chat_room_msgs_';

const IDB_NAME = 'wms_live_chat_idb_v1';
const IDB_VERSION = 1;
const STORE_ROOMS = 'chat_rooms';
const STORE_MESSAGES = 'chat_messages'; // keyed by room_id -> ChatMessage[]

// =============================================================================
// TIER 1: PERMANENT LOCAL INDEXED-DB STORAGE (0 EGRESS FOR OLD HISTORY)
// =============================================================================

function openChatIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ROOMS)) {
        db.createObjectStore(STORE_ROOMS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        db.createObjectStore(STORE_MESSAGES);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetRooms(): Promise<ChatRoom[]> {
  try {
    const db = await openChatIdb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_ROOMS, 'readonly');
      const req = tx.objectStore(STORE_ROOMS).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function idbSaveRooms(rooms: ChatRoom[]): Promise<void> {
  try {
    const db = await openChatIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_ROOMS, 'readwrite');
      const store = tx.objectStore(STORE_ROOMS);
      for (const r of rooms) {
        store.put(r);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

async function idbDeleteRoom(roomId: string): Promise<void> {
  try {
    const db = await openChatIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_ROOMS, STORE_MESSAGES], 'readwrite');
      tx.objectStore(STORE_ROOMS).delete(roomId);
      tx.objectStore(STORE_MESSAGES).delete(roomId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

async function idbGetRoomMessages(roomId: string): Promise<ChatMessage[]> {
  try {
    const db = await openChatIdb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_MESSAGES, 'readonly');
      const req = tx.objectStore(STORE_MESSAGES).get(roomId);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function idbSaveRoomMessages(roomId: string, messages: ChatMessage[]): Promise<void> {
  try {
    const db = await openChatIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      tx.objectStore(STORE_MESSAGES).put(messages, roomId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

/**
 * Merges two message arrays idempotently by message ID, preserving chronological order
 * and keeping all permanent historical messages stored on the device.
 */
function mergeMessagesIdempotent(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of existing) {
    if (m && m.id) map.set(m.id, m);
  }
  for (const m of incoming) {
    if (!m || !m.id) continue;
    const prev = map.get(m.id);
    if (!prev) {
      map.set(m.id, m);
    } else {
      // Merge read_by receipts and take newest edit/delete flags
      const readMap = new Map<string, ChatReadReceipt>();
      for (const r of prev.read_by || []) {
        if (r?.username) readMap.set(r.username.toLowerCase(), r);
      }
      for (const r of m.read_by || []) {
        if (r?.username) readMap.set(r.username.toLowerCase(), r);
      }
      map.set(m.id, {
        ...prev,
        ...m,
        read_by: Array.from(readMap.values()),
        is_edited: Boolean(prev.is_edited || m.is_edited),
        is_deleted: Boolean(prev.is_deleted || m.is_deleted),
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

// =============================================================================
// TIER 2: ZERO-SETUP SUPABASE wms_system_docs PERSISTENCE
// =============================================================================

async function fetchSystemDocJson<T>(docKey: string): Promise<T | null> {
  try {
    const cleanKey = encodeURIComponent(String(docKey || '').trim());
    if (!cleanKey) return null;
    const rows = await supabaseFetch<Array<{ doc_key: string; content: any }>>(
      'wms_system_docs',
      'GET',
      null,
      `select=content&or=(section_id.eq.${cleanKey},doc_key.eq.${cleanKey})&limit=1`
    );
    if (Array.isArray(rows) && rows.length > 0 && rows[0].content !== undefined) {
      const raw = rows[0].content;
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return null;
        }
      }
      return raw as T;
    }
  } catch (err) {
    console.warn(`[LiveChat] fetchSystemDocJson(${docKey}) warning:`, err);
  }
  return null;
}

async function saveSystemDocJson(docKey: string, content: any): Promise<boolean> {
  try {
    const payload = {
      section_id: docKey,
      doc_key: docKey,
      content,
      updated_at: new Date().toISOString(),
    };
    await supabaseFetch(
      'wms_system_docs',
      'POST',
      payload,
      'on_conflict=section_id',
      false
    );
    return true;
  } catch (err) {
    console.warn(`[LiveChat] saveSystemDocJson(${docKey}) warning:`, err);
    return false;
  }
}

// =============================================================================
// 5-MINUTE & READ RECEIPT (✓ / ✓✓) ACCOUNTABILITY RULES
// =============================================================================

export function hasOtherUserReadMessage(msg: ChatMessage, senderUsername?: string): boolean {
  const senderLower = String(senderUsername || msg.sender_username || '').trim().toLowerCase();
  if (!Array.isArray(msg.read_by)) return false;
  return msg.read_by.some((r) => String(r.username || '').trim().toLowerCase() !== senderLower);
}

export function canModifyMessage(
  msg: ChatMessage,
  currentUsername: string
): {
  allowed: boolean;
  reason?: string;
  remainingSeconds: number;
  isReadByOthers: boolean;
} {
  const me = String(currentUsername || '').trim().toLowerCase();
  const sender = String(msg.sender_username || '').trim().toLowerCase();

  if (!me || me !== sender) {
    return {
      allowed: false,
      reason: 'Hanya pengirim pesan yang dapat mengubah/menghapus pesan ini.',
      remainingSeconds: 0,
      isReadByOthers: false,
    };
  }

  if (msg.is_deleted) {
    return {
      allowed: false,
      reason: 'Pesan ini sudah dihapus.',
      remainingSeconds: 0,
      isReadByOthers: false,
    };
  }

  const isReadByOthers = hasOtherUserReadMessage(msg, sender);
  if (isReadByOthers) {
    return {
      allowed: false,
      reason: 'Terkunci: Pesan sudah dibaca (✓✓) oleh penerima sehingga tidak dapat diedit atau dihapus.',
      remainingSeconds: 0,
      isReadByOthers: true,
    };
  }

  const createdMs = new Date(msg.created_at).getTime();
  const elapsedMs = Date.now() - (Number.isFinite(createdMs) ? createdMs : 0);
  const remainingMs = Math.max(0, EDIT_DELETE_WINDOW_MS - elapsedMs);
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  if (remainingMs <= 0) {
    return {
      allowed: false,
      reason: 'Terkunci: Batas waktu edit/hapus 5 menit telah berakhir.',
      remainingSeconds: 0,
      isReadByOthers: false,
    };
  }

  return {
    allowed: true,
    remainingSeconds,
    isReadByOthers: false,
  };
}

// =============================================================================
// CLIENT-SIDE IMAGE COMPRESSION + GOOGLE DRIVE UPLOAD (0 BYTE IN SUPABASE)
// =============================================================================

export async function compressAndUploadChatImage(
  fileOrDataUrl: File | Blob | string,
  senderUsername: string
): Promise<{ success: boolean; url: string; error?: string }> {
  try {
    const compressedDataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        let width = img.width || 800;
        let height = img.height || 600;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context tidak tersedia'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.74));
      };
      img.onerror = () => reject(new Error('Gagal membaca gambar'));

      if (typeof fileOrDataUrl === 'string') {
        img.src = fileOrDataUrl;
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          img.src = String(reader.result || '');
        };
        reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
        reader.readAsDataURL(fileOrDataUrl);
      }
    });

    const cleanUser = String(senderUsername || 'user').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `Chat_${cleanUser}_${Date.now()}.jpg`;
    const uploadRes = await uploadImageToGdrive(compressedDataUrl, filename);

    if (!uploadRes.success || !uploadRes.url || uploadRes.url.startsWith('data:')) {
      return {
        success: false,
        url: '',
        error:
          uploadRes.error ||
          'Gagal mengunggah foto ke Google Drive (GAS). Pastikan koneksi Google Drive aktif di Pengaturan.',
      };
    }

    return {
      success: true,
      url: uploadRes.url,
    };
  } catch (err: any) {
    return {
      success: false,
      url: '',
      error: err?.message || 'Gagal memproses foto lampiran',
    };
  }
}

// =============================================================================
// LIVE CHAT STATE MANAGER (SINGLETON)
// =============================================================================

export interface LiveChatState {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  messagesByRoom: Record<string, ChatMessage[]>;
  onlineUsers: Record<string, OnlineUserPresence>;
  allUsersDirectory: ChatParticipantProfile[];
  totalUnreadCount: number;
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;
  isFloatingOpen: boolean;
  incomingToastMessage: {
    message: ChatMessage;
    room: ChatRoom;
  } | null;
}

export type ChatPresenceUser = OnlineUserPresence;

type ChatStateListener = (state: LiveChatState) => void;
type IncomingMessageListener = (room: ChatRoom, message: ChatMessage) => void;

class LiveChatManager {
  private state: LiveChatState = {
    rooms: [],
    activeRoomId: null,
    messagesByRoom: {},
    onlineUsers: {},
    allUsersDirectory: [],
    totalUnreadCount: 0,
    isLoadingRooms: false,
    isLoadingMessages: false,
    isFloatingOpen: false,
    incomingToastMessage: null,
  };

  private listeners = new Set<ChatStateListener>();
  private incomingListeners = new Set<IncomingMessageListener>();
  private currentSession: UserSession | null = null;
  private channel: any = null;
  private initializedForUser: string | null = null;
  private typingTimeout: any = null;
  private directoryLoadedAt = 0;
  private notifiedMessageIds = new Set<string>(loadPersistedNotifiedOrderIds());
  private hasSeededUnread = false;
  private syncTimer: any = null;
  private swListenerBound = false;

  public subscribe(listener: ChatStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeIncomingMessage(listener: IncomingMessageListener): () => void {
    this.incomingListeners.add(listener);
    return () => {
      this.incomingListeners.delete(listener);
    };
  }

  public getTotalUnreadCount(): number {
    return this.state.totalUnreadCount || 0;
  }

  public getOnlineUsers(): OnlineUserPresence[] {
    return Object.values(this.state.onlineUsers || {});
  }

  public getVisibleRooms(): ChatRoom[] {
    return [...this.state.rooms];
  }

  public setActivePage(activePage?: string): void {
    this.trackPresence(activePage);
  }

  public teardown(): void {
    void this.initForSession(null);
  }

  public async syncRoomsIndexFromCloud(): Promise<ChatRoom[]> {
    return this.syncRoomsFromServer();
  }

  public getSnapshot(): LiveChatState {
    return {
      ...this.state,
      rooms: [...this.state.rooms],
      messagesByRoom: { ...this.state.messagesByRoom },
      onlineUsers: { ...this.state.onlineUsers },
      allUsersDirectory: [...this.state.allUsersDirectory],
    };
  }

  private notify() {
    this.recalculateUnreadCount();
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  private recalculateUnreadCount() {
    const me = String(this.currentSession?.username || '').trim().toLowerCase();
    if (!me) {
      this.state.totalUnreadCount = 0;
      return;
    }
    let total = 0;
    for (const r of this.state.rooms) {
      if (!this.isUserInRoom(r, me)) continue;
      const count = r.unread_counts?.[me];
      if (typeof count === 'number' && count > 0) {
        total += count;
      } else if (Array.isArray(r.unread_by) && r.unread_by.includes(me)) {
        total += 1;
      }
    }
    this.state.totalUnreadCount = total;
  }

  public isUserInRoom(room: ChatRoom, username?: string): boolean {
    const u = String(username || this.currentSession?.username || '').trim().toLowerCase();
    if (!u) return false;
    return Array.isArray(room.participants) && room.participants.some((p) => p.toLowerCase() === u);
  }

  public setFloatingOpen(open: boolean) {
    this.state.isFloatingOpen = open;
    if (open && this.state.activeRoomId) {
      void this.markRoomAsRead(this.state.activeRoomId);
    }
    this.notify();
  }

  public pendingOrderContext: ChatOrderContext | null = null;

  public setPendingOrderContext(ctx: ChatOrderContext | null) {
    this.pendingOrderContext = ctx;
    this.notify();
  }

  /**
   * Shopee-Style "Tanya Pesanan / Chat ke Gudang":
   * Opens direct chat with Warehouse (or Store) and attaches order context
   */
  public async openOrderChat(orderData: ChatOrderContext): Promise<void> {
    if (!this.currentSession?.username) {
      console.warn('[LiveChat] Cannot open order chat: session not found');
      return;
    }
    const me = this.currentSession.username.trim().toLowerCase();
    let targetUsername = 'warehouse';
    if (me === 'warehouse') {
      targetUsername = orderData.store_name?.toLowerCase().replace(/\s+/g, '_') || 'warehouse';
    }

    let targetProfile = this.state.allUsersDirectory.find(
      (u) => u.username.toLowerCase() === targetUsername.toLowerCase()
    );
    if (!targetProfile) {
      targetProfile = {
        username: targetUsername,
        name: targetUsername === 'warehouse' ? 'Warehouse (Gudang Pusat)' : orderData.store_name || targetUsername,
        role: targetUsername === 'warehouse' ? 'Superadmin' : 'Store',
      };
    }

    this.pendingOrderContext = orderData;
    this.setFloatingOpen(true);
    const room = await this.openOrCreateDirectRoom(targetProfile);
    if (room) {
      await this.selectRoom(room.id);
      if (typeof window !== 'undefined') {
        // 1. Arahkan halaman langsung ke Live Chat (seperti Shopee Chat ke Penjual)
        window.dispatchEvent(
          new CustomEvent('wms_navigate_page', { detail: { page: 'live_chat' } })
        );

        // 2. Buka room tersebut secara eksplisit
        window.dispatchEvent(
          new CustomEvent('wms_open_live_chat_room', {
            detail: { roomId: room.id, openFullPage: true }
          })
        );

        // 3. Pasang order context pada room
        window.dispatchEvent(
          new CustomEvent('wms:open_order_chat', { detail: { roomId: room.id, orderData } })
        );
      }
    }
  }

  public dismissIncomingToast() {
    this.state.incomingToastMessage = null;
    this.notify();
  }

  /**
   * Initialize Realtime Presence + Broadcast + Local IndexedDB for the logged-in user
   */
  public async initForSession(session: UserSession | null, activePage?: string): Promise<void> {
    this.currentSession = session;
    const username = String(session?.username || '').trim().toLowerCase();

    if (!session || !username) {
      this.cleanupChannel();
      this.initializedForUser = null;
      this.state.rooms = [];
      this.state.activeRoomId = null;
      this.state.onlineUsers = {};
      this.state.totalUnreadCount = 0;
      this.notify();
      return;
    }

    if (this.initializedForUser === username && this.channel) {
      // Just update active_page presence if needed
      this.trackPresence(activePage);
      return;
    }

    this.initializedForUser = username;
    this.hasSeededUnread = false;
    this.notifiedMessageIds = new Set<string>(loadPersistedNotifiedOrderIds());

    // 1. Load cached rooms from IndexedDB immediately (0 ms, 0 egress)
    const cachedRooms = await idbGetRooms();
    const myCachedRooms = cachedRooms
      .filter((r) => this.isUserInRoom(r, username))
      .sort((a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a));

    if (myCachedRooms.length > 0) {
      this.state.rooms = myCachedRooms;
      this.notify();
    }

    // 2. Connect to Supabase Realtime Channel (Presence + Broadcast + wms_system_docs changes)
    this.setupRealtimeChannel(session, activePage);
    this.setupBackgroundSyncLoop();

    // 3. Load user directory and sync rooms index from wms_system_docs
    void this.refreshUsersDirectory();
    await this.syncRoomsFromServer(false);
    this.hasSeededUnread = true;
  }

  private setupBackgroundSyncLoop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    // Hemat egress & log ingestion: sinkronisasi polling diperpanjang ke 60 detik dan hanya berjalan saat tab terlihat
    this.syncTimer = setInterval(() => {
      if (this.currentSession?.username && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void this.syncRoomsFromServer(true);
      }
    }, 60000); // 60s (menghemat 75% request polling ke wms_system_docs)

    if (!this.swListenerBound && typeof window !== 'undefined') {
      this.swListenerBound = true;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
          const data = event.data;
          if (!data || typeof data !== 'object') return;
          if (data.type === 'WMS_SW_ORDERS_NOTIFIED' && Array.isArray(data.notifiedIds)) {
            data.notifiedIds.forEach((id: string) => {
              if (id) this.notifiedMessageIds.add(String(id));
            });
          } else if (data.type === 'WMS_SW_CHAT_REPLIED') {
            void this.syncRoomsFromServer(false);
            if (data.roomId && this.state.activeRoomId === data.roomId) {
              void this.selectRoom(data.roomId);
            }
          }
        });
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.currentSession?.username) {
          void this.syncRoomsFromServer(true);
        }
      });
    }
  }

  private getRoomSortTime(room: ChatRoom): number {
    const ts = room.last_message_at || room.updated_at || room.created_at;
    const ms = ts ? new Date(ts).getTime() : 0;
    return Number.isFinite(ms) ? ms : 0;
  }

  private cleanupChannel() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.channel) {
      try {
        const client = getSupabaseClient();
        client.removeChannel(this.channel);
      } catch {}
      this.channel = null;
    }
  }

  private setupRealtimeChannel(session: UserSession, activePage?: string) {
    this.cleanupChannel();
    const username = String(session.username || '').trim().toLowerCase();
    if (!username) return;

    try {
      const client = getSupabaseClient();
      const ch = client.channel('wms-live-chat-v1', {
        config: {
          presence: { key: username },
          broadcast: { self: false },
        },
      });

      ch.on('presence', { event: 'sync' }, () => {
        try {
          const rawState = ch.presenceState() || {};
          const nextOnline: Record<string, OnlineUserPresence> = {};
          for (const [key, presences] of Object.entries(rawState)) {
            const list = Array.isArray(presences) ? presences : [];
            if (list.length > 0) {
              const latest = list[list.length - 1] as any;
              const uKey = String(latest.username || key).trim().toLowerCase();
              nextOnline[uKey] = {
                username: uKey,
                name: latest.name || getUserPersonName(uKey) || uKey,
                role: latest.role || 'Operator',
                store_name: latest.store_name || undefined,
                online_at: latest.online_at || new Date().toISOString(),
                active_page: latest.active_page || undefined,
                typing_room_id: latest.typing_room_id || null,
              };
            }
          }
          this.state.onlineUsers = nextOnline;
          this.notify();
        } catch {}
      });

      // Broadcast Event 1: New Message
      ch.on('broadcast', { event: 'chat:new_message' }, (payload: any) => {
        const data = payload?.payload;
        if (!data || !data.message || !data.room) return;
        void this.handleIncomingBroadcastMessage(data.room as ChatRoom, data.message as ChatMessage);
      });

      // Broadcast Event 2: Message Edited or Deleted
      ch.on('broadcast', { event: 'chat:message_updated' }, (payload: any) => {
        const data = payload?.payload;
        if (!data || !data.message || !data.roomId) return;
        void this.handleIncomingMessageUpdate(String(data.roomId), data.message as ChatMessage, data.room as ChatRoom | undefined);
      });

      // Broadcast Event 3: Messages Read (✓✓)
      ch.on('broadcast', { event: 'chat:messages_read' }, (payload: any) => {
        const data = payload?.payload;
        if (!data || !data.roomId || !data.reader) return;
        void this.handleIncomingReadReceipt(String(data.roomId), data.reader as ChatReadReceipt);
      });

      // Broadcast Event 4: Room Created / Updated / Deleted
      ch.on('broadcast', { event: 'chat:room_updated' }, (payload: any) => {
        const data = payload?.payload;
        if (!data) return;
        if (data.deletedRoomId) {
          void this.handleIncomingRoomDeleted(String(data.deletedRoomId));
        } else if (data.room) {
          void this.handleIncomingRoomUpsert(data.room as ChatRoom);
        }
      });

      // Postgres Changes Event 5: Listen to wms_system_docs updates (e.g. inline replies from Notification Bar or background sync)
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wms_system_docs' },
        (payload: any) => {
          const docKey = String(payload?.new?.doc_key || '');
          if (docKey === ROOMS_INDEX_DOC_KEY) {
            void this.syncRoomsFromServer(true);
          } else if (
            this.state.activeRoomId &&
            docKey === `${ROOM_MSGS_DOC_PREFIX}${this.state.activeRoomId}`
          ) {
            void this.selectRoom(this.state.activeRoomId);
          }
        }
      );

      ch.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          this.trackPresence(activePage);
        }
      });

      this.channel = ch;
    } catch (err) {
      console.warn('[LiveChat] Realtime channel setup warning:', err);
    }
  }

  public trackPresence(activePage?: string, typingRoomId: string | null = null) {
    if (!this.channel || !this.currentSession) return;
    const username = String(this.currentSession.username || '').trim().toLowerCase();
    if (!username) return;

    const displayName =
      this.currentSession.name ||
      getUserPersonName(username) ||
      this.currentSession.store_name ||
      username;

    try {
      void this.channel.track({
        username,
        name: displayName,
        role: this.currentSession.role || 'Operator',
        store_name: this.currentSession.store_name || undefined,
        online_at: new Date().toISOString(),
        active_page: activePage || undefined,
        typing_room_id: typingRoomId,
      });
    } catch {}
  }

  public sendTypingIndicator(roomId: string | null) {
    this.trackPresence(undefined, roomId);
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    if (roomId) {
      this.typingTimeout = setTimeout(() => {
        this.trackPresence(undefined, null);
      }, 3000);
    }
  }

  /**
   * Loads all registered WMS users so any existing or newly added user is immediately available
   */
  public async refreshUsersDirectory(force = false): Promise<ChatParticipantProfile[]> {
    if (!force && this.state.allUsersDirectory.length > 0 && Date.now() - this.directoryLoadedAt < 60_000) {
      return this.state.allUsersDirectory;
    }

    try {
      const users = await fetchWmsUsersFromSupabase();
      const map = new Map<string, ChatParticipantProfile>();

      for (const u of users || []) {
        const uname = String(u.username || '').trim().toLowerCase();
        if (!uname) continue;
        map.set(uname, {
          username: uname,
          name: u.name || getUserPersonName(uname) || u.store_name || uname,
          role: u.role || 'Operator',
          store_name: u.store_name || undefined,
        });
      }

      // Ensure current session user is also in directory
      if (this.currentSession?.username) {
        const myUname = this.currentSession.username.trim().toLowerCase();
        if (!map.has(myUname)) {
          map.set(myUname, {
            username: myUname,
            name:
              this.currentSession.name ||
              getUserPersonName(myUname) ||
              this.currentSession.store_name ||
              myUname,
            role: this.currentSession.role || 'Operator',
            store_name: this.currentSession.store_name || undefined,
          });
        }
      }

      // Also merge any online users
      for (const online of Object.values(this.state.onlineUsers)) {
        const uname = online.username.toLowerCase();
        if (!map.has(uname)) {
          map.set(uname, {
            username: uname,
            name: online.name,
            role: online.role,
            store_name: online.store_name,
          });
        }
      }

      const sorted = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'id'));
      this.state.allUsersDirectory = sorted;
      this.directoryLoadedAt = Date.now();
      this.notify();
      return sorted;
    } catch {
      return this.state.allUsersDirectory;
    }
  }

  /**
   * Syncs the lightweight rooms index from wms_system_docs
   */
  public async syncRoomsFromServer(triggerNotification = false): Promise<ChatRoom[]> {
    if (!this.currentSession?.username) return [];
    const me = this.currentSession.username.trim().toLowerCase();
    this.state.isLoadingRooms = true;
    this.notify();

    try {
      const serverRooms = await fetchSystemDocJson<ChatRoom[]>(ROOMS_INDEX_DOC_KEY);
      const validRooms = Array.isArray(serverRooms) ? serverRooms : [];

      // Merge with local cached rooms
      const roomMap = new Map<string, ChatRoom>();
      for (const r of this.state.rooms) {
        if (r?.id) roomMap.set(r.id, r);
      }
      for (const r of validRooms) {
        if (r?.id) roomMap.set(r.id, r);
      }

      const allMerged = Array.from(roomMap.values());
      await idbSaveRooms(allMerged);

      const myRooms = allMerged
        .filter((r) => this.isUserInRoom(r, me))
        .sort((a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a));

      const isOnLiveChatPage =
        typeof window !== 'undefined' && window.location.pathname.includes('live-chat');

      for (const r of myRooms) {
        const lastMsgId = String(r.last_message_id || '').trim();
        if (!lastMsgId) continue;
        const lastSender = String(r.last_message_sender || '').trim().toLowerCase();
        const isUnread =
          Array.isArray(r.unread_by) && r.unread_by.some((u) => String(u || '').toLowerCase() === me);

        if (!this.hasSeededUnread && !triggerNotification) {
          // On initial boot: if the message arrived very recently (< 10 mins ago) and wasn't notified yet, notify once; otherwise seed it
          const msgTs = r.last_message_at ? new Date(r.last_message_at).getTime() : 0;
          const isRecentMissed =
            isUnread &&
            lastSender !== me &&
            msgTs > 0 &&
            Date.now() - msgTs <= 10 * 60 * 1000 &&
            !this.notifiedMessageIds.has(lastMsgId);

          if (!isRecentMissed) {
            this.notifiedMessageIds.add(lastMsgId);
            continue;
          }
        }

        if (isUnread && lastSender !== me && !this.notifiedMessageIds.has(lastMsgId)) {
          this.notifiedMessageIds.add(lastMsgId);
          savePersistedNotifiedOrderIds(this.notifiedMessageIds);
          void syncNotifiedOrdersToServiceWorker(Array.from(this.notifiedMessageIds));

          const isViewingThisRoom =
            this.state.activeRoomId === r.id && (this.state.isFloatingOpen || isOnLiveChatPage);

          if (!isViewingThisRoom) {
            const senderLabel = String(
              r.last_message_sender_name || r.last_message_sender || 'Rekan Tim'
            ).trim();
            const synthMessage: ChatMessage = {
              id: lastMsgId,
              room_id: r.id,
              sender_username: lastSender,
              sender_name: senderLabel,
              sender_role: 'Operator',
              text: r.last_message_text || 'Mengirim pesan baru',
              created_at: r.last_message_at || new Date().toISOString(),
              read_by: [],
            };

            playNewTaskChime();
            vibrateDevice([200, 100, 200]);
            this.state.incomingToastMessage = { message: synthMessage, room: r };
            this.incomingListeners.forEach((fn) => {
              try {
                fn(r, synthMessage);
              } catch {}
            });

            const textLower = (r.last_message_text || '').toLowerCase();
            const isMentioned =
              textLower.includes(`@${me}`) || textLower.includes('@semua') || textLower.includes('@all');
            const notifTitle = isMentioned
              ? `🔔 [${r.name || 'Grup'}] ${senderLabel} menandai Anda!`
              : r.type === 'group'
              ? `💬 [${r.name || 'Grup Diskusi'}] ${senderLabel}`
              : `💬 Pesan dari ${senderLabel}`;
            void showPushNotification(notifTitle, {
              body: r.last_message_text || '📷 Mengirim lampiran foto',
              tag: `wms-chat-${r.id}`,
              url: '/live-chat',
              page: 'live_chat',
              roomId: r.id,
              roomName: r.name || senderLabel,
              actions: [
                {
                  action: 'chat_reply',
                  type: 'text',
                  title: '💬 Balas Cepat',
                  placeholder: 'Ketik balasan pesan...',
                },
                {
                  action: 'chat_mark_read',
                  title: '✓✓ Tandai Dibaca',
                },
              ],
            });
          }
        }
      }

      this.state.rooms = myRooms;
      this.state.isLoadingRooms = false;
      this.notify();
      return myRooms;
    } catch {
      this.state.isLoadingRooms = false;
      this.notify();
      return this.state.rooms;
    }
  }

  /**
   * Opens a room, loads permanent local IndexedDB messages immediately, and delta-syncs hot messages from Supabase
   */
  public async selectRoom(roomId: string | null): Promise<void> {
    this.state.activeRoomId = roomId;
    if (!roomId) {
      this.notify();
      return;
    }

    // 1. Load permanent local messages from IndexedDB (0 ms, 0 egress)
    const localMsgs = await idbGetRoomMessages(roomId);
    if (localMsgs.length > 0) {
      this.state.messagesByRoom[roomId] = localMsgs;
      this.notify();
    } else {
      this.state.isLoadingMessages = true;
      this.notify();
    }

    // 2. Fetch hot messages for this room from wms_system_docs and merge idempotently
    try {
      const hotMsgs = await fetchSystemDocJson<ChatMessage[]>(`${ROOM_MSGS_DOC_PREFIX}${roomId}`);
      if (Array.isArray(hotMsgs)) {
        const merged = mergeMessagesIdempotent(localMsgs, hotMsgs);
        this.state.messagesByRoom[roomId] = merged;
        await idbSaveRoomMessages(roomId, merged);
      } else if (!this.state.messagesByRoom[roomId]) {
        this.state.messagesByRoom[roomId] = [];
      }
    } catch {}

    this.state.isLoadingMessages = false;
    this.notify();

    // 3. Mark room messages as read (✓✓)
    await this.markRoomAsRead(roomId);
  }

  /**
   * Load older archived messages from Google Drive cold storage if user is on a new device
   */
  public async loadArchivedMessagesFromGdrive(roomId: string): Promise<number> {
    const room = this.state.rooms.find((r) => r.id === roomId);
    if (!room || !Array.isArray(room.archive_urls) || room.archive_urls.length === 0) {
      return 0;
    }

    let addedCount = 0;
    const currentMsgs = this.state.messagesByRoom[roomId] || (await idbGetRoomMessages(roomId));
    let merged = [...currentMsgs];

    for (const url of room.archive_urls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const archivedBatch = await res.json();
          if (Array.isArray(archivedBatch)) {
            const beforeLen = merged.length;
            merged = mergeMessagesIdempotent(merged, archivedBatch);
            addedCount += Math.max(0, merged.length - beforeLen);
          }
        }
      } catch {}
    }

    if (addedCount > 0) {
      this.state.messagesByRoom[roomId] = merged;
      await idbSaveRoomMessages(roomId, merged);
      this.notify();
    }
    return addedCount;
  }

  /**
   * Get or create a 1-on-1 Direct Message room with another user
   */
  public async openOrCreateDirectRoom(targetUser: ChatParticipantProfile): Promise<ChatRoom | null> {
    if (!this.currentSession?.username) return null;
    const me = this.currentSession.username.trim().toLowerCase();
    const other = targetUser.username.trim().toLowerCase();
    if (!me || !other) return null;

    const sortedPair = [me, other].sort();
    const directRoomId = `direct_${sortedPair[0]}_${sortedPair[1]}`;

    const existing = this.state.rooms.find((r) => r.id === directRoomId);
    if (existing) {
      await this.selectRoom(existing.id);
      return existing;
    }

    const myName =
      this.currentSession.name ||
      getUserPersonName(me) ||
      this.currentSession.store_name ||
      me;

    const now = new Date().toISOString();
    const newRoom: ChatRoom = {
      id: directRoomId,
      type: 'direct',
      name: targetUser.name || other,
      participants: sortedPair,
      participant_profiles: {
        [me]: {
          username: me,
          name: myName,
          role: this.currentSession.role || 'Operator',
          store_name: this.currentSession.store_name || undefined,
        },
        [other]: {
          username: other,
          name: targetUser.name || getUserPersonName(other) || other,
          role: targetUser.role || 'Operator',
          store_name: targetUser.store_name || undefined,
        },
      },
      created_by: me,
      created_by_name: myName,
      created_at: now,
      updated_at: now,
      unread_by: [],
      unread_counts: {},
    };

    await this.upsertRoomToServer(newRoom);
    await this.selectRoom(newRoom.id);
    return newRoom;
  }

  /**
   * Create a Multi-User Group Discussion Room (Restricted to Admin & Superadmin)
   */
  public async createGroupRoom(params: {
    name: string;
    topic?: string;
    theme_color?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'purple';
    participantUsernames: string[];
  }): Promise<{ success: boolean; room?: ChatRoom; error?: string }> {
    if (!this.currentSession) {
      return { success: false, error: 'Silakan login terlebih dahulu.' };
    }

    const canManage =
      isSuperadmin(this.currentSession) ||
      Boolean(this.currentSession.permissions?.action_manage_chat_groups);

    if (!canManage) {
      return {
        success: false,
        error: 'Hanya Admin dan Superadmin yang dapat membuat Ruang Diskusi Grup baru.',
      };
    }

    const cleanName = String(params.name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Nama Ruang Diskusi wajib diisi.' };
    }

    const me = this.currentSession.username.trim().toLowerCase();
    const myName =
      this.currentSession.name ||
      getUserPersonName(me) ||
      this.currentSession.store_name ||
      me;

    const uniqueMembers = Array.from(
      new Set([me, ...params.participantUsernames.map((u) => u.trim().toLowerCase()).filter(Boolean)])
    );

    if (uniqueMembers.length < 2) {
      return { success: false, error: 'Pilih minimal 1 rekan lain untuk dimasukkan ke Ruang Diskusi.' };
    }

    const profiles: Record<string, ChatParticipantProfile> = {};
    for (const uname of uniqueMembers) {
      const found = this.state.allUsersDirectory.find((u) => u.username.toLowerCase() === uname);
      profiles[uname] = found || {
        username: uname,
        name: uname === me ? myName : getUserPersonName(uname) || uname,
        role: uname === me ? this.currentSession.role || 'Superadmin' : 'Operator',
      };
    }

    const now = new Date().toISOString();
    const roomId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newRoom: ChatRoom = {
      id: roomId,
      type: 'group',
      name: cleanName,
      topic: params.topic?.trim() || undefined,
      theme_color: params.theme_color || 'indigo',
      participants: uniqueMembers,
      participant_profiles: profiles,
      created_by: me,
      created_by_name: myName,
      created_at: now,
      updated_at: now,
      last_message_text: `Ruang diskusi "${cleanName}" dibuat oleh ${myName}`,
      last_message_sender: me,
      last_message_sender_name: myName,
      last_message_at: now,
      unread_by: uniqueMembers.filter((u) => u !== me),
      unread_counts: uniqueMembers.reduce((acc, u) => {
        acc[u] = u === me ? 0 : 1;
        return acc;
      }, {} as Record<string, number>),
    };

    await this.upsertRoomToServer(newRoom);
    await this.selectRoom(newRoom.id);
    return { success: true, room: newRoom };
  }

  /**
   * Add or remove members in an existing Group Discussion Room (Admin, Superadmin, or Group Creator)
   */
  public async updateGroupMembers(
    roomId: string,
    participantUsernames: string[],
    updatedName?: string,
    updatedTopic?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.currentSession) return { success: false, error: 'Sesi tidak ditemukan.' };
    const me = this.currentSession.username.trim().toLowerCase();

    const room = this.state.rooms.find((r) => r.id === roomId);
    if (!room || room.type !== 'group') {
      return { success: false, error: 'Ruang grup tidak ditemukan.' };
    }

    const isCreator = String(room.created_by || '').trim().toLowerCase() === me;
    const canManage =
      isSuperadmin(this.currentSession) ||
      Boolean(this.currentSession.permissions?.action_manage_chat_groups) ||
      isCreator;

    if (!canManage) {
      return {
        success: false,
        error: 'Hanya Pembuat Grup atau Admin yang dapat menambah atau mengatur anggota grup.',
      };
    }

    const uniqueMembers = Array.from(
      new Set(participantUsernames.map((u) => u.trim().toLowerCase()).filter(Boolean))
    );

    if (uniqueMembers.length === 0) {
      return this.deleteChatRoom(roomId);
    }

    const profiles: Record<string, ChatParticipantProfile> = { ...(room.participant_profiles || {}) };
    for (const uname of uniqueMembers) {
      if (!profiles[uname]) {
        const found = this.state.allUsersDirectory.find((u) => u.username.toLowerCase() === uname);
        profiles[uname] = found || {
          username: uname,
          name: getUserPersonName(uname) || uname,
          role: 'Operator',
        };
      }
    }

    const updatedRoom: ChatRoom = {
      ...room,
      name: updatedName?.trim() || room.name,
      topic: updatedTopic !== undefined ? updatedTopic.trim() || undefined : room.topic,
      participants: uniqueMembers,
      participant_profiles: profiles,
      updated_at: new Date().toISOString(),
    };

    await this.upsertRoomToServer(updatedRoom);
    return { success: true };
  }

  /**
   * Leave a group discussion room (any member)
   */
  public async leaveGroupRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.currentSession) return { success: false, error: 'Sesi tidak ditemukan.' };
    const me = this.currentSession.username.trim().toLowerCase();
    const room = this.state.rooms.find((r) => r.id === roomId);
    if (!room || room.type !== 'group') {
      return { success: false, error: 'Ruang grup tidak ditemukan.' };
    }
    const remaining = room.participants.filter((p) => p.toLowerCase() !== me);
    if (remaining.length === 0) {
      return this.deleteChatRoom(roomId);
    }
    return this.updateGroupMembers(roomId, remaining, room.name, room.topic);
  }

  /**
   * Delete a Chat Room (Direct 1-on-1 chat by its participant or Admin; Group room by Creator, Admin & Superadmin)
   */
  public async deleteChatRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.currentSession) return { success: false, error: 'Sesi tidak ditemukan.' };
    const me = this.currentSession.username.trim().toLowerCase();
    const isAdmin =
      isSuperadmin(this.currentSession) ||
      Boolean(this.currentSession.permissions?.action_manage_chat_groups);

    const room = this.state.rooms.find((r) => r.id === roomId);
    const isCreator = room && String(room.created_by || '').trim().toLowerCase() === me;

    if (room && room.type === 'group' && !isAdmin && !isCreator) {
      return { success: false, error: 'Hanya Pembuat Grup, Admin, atau Superadmin yang dapat menghapus Ruang Diskusi Grup.' };
    }
    if (room && room.type === 'direct' && !isAdmin && !this.isUserInRoom(room, me)) {
      return { success: false, error: 'Anda tidak memiliki akses untuk menghapus percakapan ini.' };
    }

    const serverRooms = (await fetchSystemDocJson<ChatRoom[]>(ROOMS_INDEX_DOC_KEY)) || [];
    const remaining = serverRooms.filter((r) => r.id !== roomId);
    await saveSystemDocJson(ROOMS_INDEX_DOC_KEY, remaining);
    await saveSystemDocJson(`${ROOM_MSGS_DOC_PREFIX}${roomId}`, []);
    await idbDeleteRoom(roomId);

    this.state.rooms = this.state.rooms.filter((r) => r.id !== roomId);
    delete this.state.messagesByRoom[roomId];
    if (this.state.activeRoomId === roomId) {
      this.state.activeRoomId = null;
    }
    this.notify();

    try {
      this.channel?.send({
        type: 'broadcast',
        event: 'chat:room_updated',
        payload: { deletedRoomId: roomId },
      });
    } catch {}

    return { success: true };
  }

  public async deleteGroupRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    return this.deleteChatRoom(roomId);
  }

  private async upsertRoomToServer(room: ChatRoom): Promise<void> {
    // Update local state immediately
    const idx = this.state.rooms.findIndex((r) => r.id === room.id);
    if (idx >= 0) {
      this.state.rooms[idx] = room;
    } else {
      this.state.rooms.unshift(room);
    }
    this.state.rooms.sort((a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a));
    this.notify();

    await idbSaveRooms([room]);

    // Sync with server index without losing any existing rooms from server or memory
    const serverRooms = (await fetchSystemDocJson<ChatRoom[]>(ROOMS_INDEX_DOC_KEY)) || [];
    const map = new Map<string, ChatRoom>();
    for (const r of serverRooms) {
      if (r?.id) map.set(r.id, r);
    }
    for (const r of this.state.rooms) {
      if (r?.id && !map.has(r.id)) {
        map.set(r.id, r);
      }
    }
    map.set(room.id, room);
    const updatedList = Array.from(map.values()).sort(
      (a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a)
    );
    await saveSystemDocJson(ROOMS_INDEX_DOC_KEY, updatedList);

    try {
      this.channel?.send({
        type: 'broadcast',
        event: 'chat:room_updated',
        payload: { room },
      });
    } catch {}
  }

  /**
   * Send a new message in a room (Optimistic UI + WebSocket Broadcast + Tier 1/2/3 Storage)
   */
  public async sendMessage(params: {
    roomId: string;
    text: string;
    attachmentUrl?: string;
    contextTags?: ChatContextTag[];
    orderContext?: ChatOrderContext;
    replyTo?: ChatReplyQuote;
  }): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
    if (!this.currentSession?.username) {
      return { success: false, error: 'Silakan login terlebih dahulu.' };
    }

    const cleanText = String(params.text || '').trim();
    const hasAttachment = Boolean(params.attachmentUrl);
    const hasTags = Array.isArray(params.contextTags) && params.contextTags.length > 0;
    const attachedOrder = params.orderContext || this.pendingOrderContext || undefined;
    const hasOrder = Boolean(attachedOrder);

    if (!cleanText && !hasAttachment && !hasTags && !hasOrder) {
      return { success: false, error: 'Pesan tidak boleh kosong.' };
    }

    // Strict No-Base64 guard
    if (params.attachmentUrl && params.attachmentUrl.startsWith('data:')) {
      return {
        success: false,
        error: 'Gambar wajib diunggah ke Google Drive terlebih dahulu agar tidak membebani Supabase.',
      };
    }

    const room = this.state.rooms.find((r) => r.id === params.roomId);
    if (!room) {
      return { success: false, error: 'Ruang chat tidak ditemukan.' };
    }

    const me = this.currentSession.username.trim().toLowerCase();
    const myName =
      this.currentSession.name ||
      getUserPersonName(me) ||
      this.currentSession.store_name ||
      me;

    // Detect @mentions in message body
    const mentions = Array.from(
      new Set(
        (cleanText.match(/@([a-zA-Z0-9_\-]+)/g) || []).map((m) => m.slice(1).toLowerCase())
      )
    );

    const now = new Date().toISOString();
    const newMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      room_id: room.id,
      sender_username: me,
      sender_name: myName,
      sender_role: this.currentSession.role || 'Operator',
      sender_store: this.currentSession.store_name || undefined,
      text: cleanText,
      attachment_url: params.attachmentUrl || undefined,
      context_tags: params.contextTags && params.contextTags.length > 0 ? params.contextTags : undefined,
      order_context: attachedOrder,
      mentions: mentions.length > 0 ? mentions : undefined,
      reply_to: params.replyTo || undefined,
      created_at: now,
      read_by: [
        {
          username: me,
          name: myName,
          read_at: now,
        },
      ],
    };

    // Reset pending order context if it was used
    if (this.pendingOrderContext) {
      this.pendingOrderContext = null;
    }

    // 1. Optimistic Local Update + IndexedDB permanent save
    const existingLocal = this.state.messagesByRoom[room.id] || (await idbGetRoomMessages(room.id));
    const updatedLocal = mergeMessagesIdempotent(existingLocal, [newMsg]);
    this.state.messagesByRoom[room.id] = updatedLocal;

    const previewText = cleanText
      ? cleanText
      : hasAttachment
      ? '📷 Mengirim foto lampiran'
      : attachedOrder
      ? `📦 Diskusi Pesanan #${attachedOrder.order_id}`
      : `🏷️ Tag ${params.contextTags?.[0]?.code || ''}`;

    const otherParticipants = room.participants.filter((p) => p.toLowerCase() !== me);
    const nextUnreadCounts: Record<string, number> = { ...(room.unread_counts || {}) };
    nextUnreadCounts[me] = 0;
    for (const p of otherParticipants) {
      nextUnreadCounts[p] = (Number(nextUnreadCounts[p]) || 0) + 1;
    }

    const updatedRoom: ChatRoom = {
      ...room,
      updated_at: now,
      last_message_id: newMsg.id,
      last_message_text: previewText,
      last_message_sender: me,
      last_message_sender_name: myName,
      last_message_at: now,
      unread_by: Array.from(new Set([...(room.unread_by || []), ...otherParticipants])),
      unread_counts: nextUnreadCounts,
    };

    const rIdx = this.state.rooms.findIndex((r) => r.id === room.id);
    if (rIdx >= 0) {
      this.state.rooms[rIdx] = updatedRoom;
    }
    this.state.rooms.sort((a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a));
    this.notify();

    // Clear typing indicator
    this.sendTypingIndicator(null);

    // 2. Broadcast immediately via WebSocket for 0-latency delivery to online users
    try {
      this.channel?.send({
        type: 'broadcast',
        event: 'chat:new_message',
        payload: {
          room: updatedRoom,
          message: newMsg,
        },
      });
    } catch {}

    // 3. Persist to IndexedDB & Supabase Hot Store (with Cold Archive if > 150 msgs)
    await idbSaveRoomMessages(room.id, updatedLocal);
    await this.persistHotMessagesAndRoomIndex(updatedRoom, updatedLocal);

    return { success: true, message: newMsg };
  }

  private async persistHotMessagesAndRoomIndex(
    updatedRoom: ChatRoom,
    allMessages: ChatMessage[]
  ): Promise<void> {
    let hotMessages = allMessages;

    // If messages exceed HOT_MESSAGE_LIMIT_PER_ROOM, keep the newest HOT_MESSAGE_LIMIT_PER_ROOM in Supabase
    // while all historical messages remain permanently in IndexedDB!
    if (hotMessages.length > HOT_MESSAGE_LIMIT_PER_ROOM) {
      hotMessages = hotMessages.slice(-HOT_MESSAGE_LIMIT_PER_ROOM);
    }

    await saveSystemDocJson(`${ROOM_MSGS_DOC_PREFIX}${updatedRoom.id}`, hotMessages);

    const serverRooms = (await fetchSystemDocJson<ChatRoom[]>(ROOMS_INDEX_DOC_KEY)) || [];
    const map = new Map<string, ChatRoom>();
    for (const r of serverRooms) {
      if (r?.id) map.set(r.id, r);
    }
    for (const r of this.state.rooms) {
      if (r?.id && !map.has(r.id)) {
        map.set(r.id, r);
      }
    }
    map.set(updatedRoom.id, updatedRoom);
    const sortedRooms = Array.from(map.values()).sort(
      (a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a)
    );
    await saveSystemDocJson(ROOMS_INDEX_DOC_KEY, sortedRooms);
    await idbSaveRooms([updatedRoom]);
  }

  /**
   * Edit a message (Allowed ONLY within 5 minutes AND if unread by others)
   */
  public async editMessage(
    roomId: string,
    messageId: string,
    newText: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.currentSession?.username) {
      return { success: false, error: 'Silakan login terlebih dahulu.' };
    }

    const cleanText = String(newText || '').trim();
    if (!cleanText) {
      return { success: false, error: 'Teks pesan tidak boleh kosong.' };
    }

    const me = this.currentSession.username.trim().toLowerCase();
    const msgs = this.state.messagesByRoom[roomId] || (await idbGetRoomMessages(roomId));
    const target = msgs.find((m) => m.id === messageId);

    if (!target) {
      return { success: false, error: 'Pesan tidak ditemukan.' };
    }

    // Re-verify against latest server state to ensure recipient hasn't just read it!
    const serverHot = await fetchSystemDocJson<ChatMessage[]>(`${ROOM_MSGS_DOC_PREFIX}${roomId}`);
    const latestTarget =
      (Array.isArray(serverHot) && serverHot.find((m) => m.id === messageId)) || target;

    const check = canModifyMessage(latestTarget, me);
    if (!check.allowed) {
      // Sync local state with latestTarget so UI reflects the read lock
      const synced = mergeMessagesIdempotent(msgs, [latestTarget]);
      this.state.messagesByRoom[roomId] = synced;
      this.notify();
      return { success: false, error: check.reason };
    }

    const now = new Date().toISOString();
    const updatedMsg: ChatMessage = {
      ...latestTarget,
      text: cleanText,
      is_edited: true,
      edited_at: now,
    };

    const updatedMsgs = mergeMessagesIdempotent(msgs, [updatedMsg]);
    this.state.messagesByRoom[roomId] = updatedMsgs;

    const room = this.state.rooms.find((r) => r.id === roomId);
    let updatedRoom = room;
    if (room && room.last_message_id === messageId) {
      updatedRoom = {
        ...room,
        last_message_text: `${cleanText} (Diedit)`,
        updated_at: now,
      };
      const rIdx = this.state.rooms.findIndex((r) => r.id === roomId);
      if (rIdx >= 0) this.state.rooms[rIdx] = updatedRoom;
    }

    this.notify();

    try {
      this.channel?.send({
        type: 'broadcast',
        event: 'chat:message_updated',
        payload: {
          roomId,
          message: updatedMsg,
          room: updatedRoom,
        },
      });
    } catch {}

    await idbSaveRoomMessages(roomId, updatedMsgs);
    if (updatedRoom) {
      await this.persistHotMessagesAndRoomIndex(updatedRoom, updatedMsgs);
    } else {
      await saveSystemDocJson(
        `${ROOM_MSGS_DOC_PREFIX}${roomId}`,
        updatedMsgs.slice(-HOT_MESSAGE_LIMIT_PER_ROOM)
      );
    }

    return { success: true };
  }

  /**
   * Delete / recall a message (Allowed ONLY within 5 minutes AND if unread by others; leaves audit marker)
   */
  public async deleteMessage(
    roomId: string,
    messageId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.currentSession?.username) {
      return { success: false, error: 'Silakan login terlebih dahulu.' };
    }

    const me = this.currentSession.username.trim().toLowerCase();
    const myName =
      this.currentSession.name ||
      getUserPersonName(me) ||
      this.currentSession.store_name ||
      me;

    const msgs = this.state.messagesByRoom[roomId] || (await idbGetRoomMessages(roomId));
    const target = msgs.find((m) => m.id === messageId);
    if (!target) {
      return { success: false, error: 'Pesan tidak ditemukan.' };
    }

    // Re-verify against latest server state to ensure recipient hasn't read it yet
    const serverHot = await fetchSystemDocJson<ChatMessage[]>(`${ROOM_MSGS_DOC_PREFIX}${roomId}`);
    const latestTarget =
      (Array.isArray(serverHot) && serverHot.find((m) => m.id === messageId)) || target;

    const check = canModifyMessage(latestTarget, me);
    if (!check.allowed) {
      const synced = mergeMessagesIdempotent(msgs, [latestTarget]);
      this.state.messagesByRoom[roomId] = synced;
      this.notify();
      return { success: false, error: check.reason };
    }

    const now = new Date().toISOString();
    const deletedMsg: ChatMessage = {
      ...latestTarget,
      text: '',
      attachment_url: undefined,
      context_tags: undefined,
      is_deleted: true,
      deleted_at: now,
      deleted_by: myName,
    };

    const updatedMsgs = mergeMessagesIdempotent(msgs, [deletedMsg]);
    this.state.messagesByRoom[roomId] = updatedMsgs;

    const room = this.state.rooms.find((r) => r.id === roomId);
    let updatedRoom = room;
    if (room && room.last_message_id === messageId) {
      updatedRoom = {
        ...room,
        last_message_text: `🚫 Pesan telah dihapus oleh ${myName}`,
        updated_at: now,
      };
      const rIdx = this.state.rooms.findIndex((r) => r.id === roomId);
      if (rIdx >= 0) this.state.rooms[rIdx] = updatedRoom;
    }

    this.notify();

    try {
      this.channel?.send({
        type: 'broadcast',
        event: 'chat:message_updated',
        payload: {
          roomId,
          message: deletedMsg,
          room: updatedRoom,
        },
      });
    } catch {}

    await idbSaveRoomMessages(roomId, updatedMsgs);
    if (updatedRoom) {
      await this.persistHotMessagesAndRoomIndex(updatedRoom, updatedMsgs);
    } else {
      await saveSystemDocJson(
        `${ROOM_MSGS_DOC_PREFIX}${roomId}`,
        updatedMsgs.slice(-HOT_MESSAGE_LIMIT_PER_ROOM)
      );
    }

    return { success: true };
  }

  /**
   * Marks all messages in a room as read (✓✓) by the current user
   */
  public async markRoomAsRead(roomId: string): Promise<void> {
    if (!this.currentSession?.username) return;
    const me = this.currentSession.username.trim().toLowerCase();
    const myName =
      this.currentSession.name ||
      getUserPersonName(me) ||
      this.currentSession.store_name ||
      me;
    const now = new Date().toISOString();

    const receipt: ChatReadReceipt = {
      username: me,
      name: myName,
      read_at: now,
    };

    const msgs = this.state.messagesByRoom[roomId] || (await idbGetRoomMessages(roomId));
    let anyMsgUpdated = false;

    const updatedMsgs = msgs.map((m) => {
      const alreadyRead = Array.isArray(m.read_by) && m.read_by.some((r) => r.username.toLowerCase() === me);
      if (alreadyRead) return m;
      anyMsgUpdated = true;
      return {
        ...m,
        read_by: [...(m.read_by || []), receipt],
      };
    });

    if (anyMsgUpdated) {
      this.state.messagesByRoom[roomId] = updatedMsgs;
      await idbSaveRoomMessages(roomId, updatedMsgs);
    }

    const roomIdx = this.state.rooms.findIndex((r) => r.id === roomId);
    let roomChanged = false;
    let updatedRoom: ChatRoom | undefined;

    if (roomIdx >= 0) {
      const room = this.state.rooms[roomIdx];
      const wasUnread =
        (Array.isArray(room.unread_by) && room.unread_by.includes(me)) ||
        (room.unread_counts && (room.unread_counts[me] || 0) > 0);

      if (wasUnread) {
        roomChanged = true;
        updatedRoom = {
          ...room,
          unread_by: (room.unread_by || []).filter((u) => u.toLowerCase() !== me),
          unread_counts: {
            ...(room.unread_counts || {}),
            [me]: 0,
          },
        };
        this.state.rooms[roomIdx] = updatedRoom;
      }
    }

    if (anyMsgUpdated || roomChanged) {
      this.notify();

      try {
        this.channel?.send({
          type: 'broadcast',
          event: 'chat:messages_read',
          payload: {
            roomId,
            reader: receipt,
          },
        });
      } catch {}

      if (anyMsgUpdated) {
        await saveSystemDocJson(
          `${ROOM_MSGS_DOC_PREFIX}${roomId}`,
          updatedMsgs.slice(-HOT_MESSAGE_LIMIT_PER_ROOM)
        );
      }

      if (updatedRoom) {
        const serverRooms = (await fetchSystemDocJson<ChatRoom[]>(ROOMS_INDEX_DOC_KEY)) || [];
        const map = new Map<string, ChatRoom>();
        for (const r of serverRooms) {
          if (r?.id) map.set(r.id, r);
        }
        map.set(updatedRoom.id, updatedRoom);
        await saveSystemDocJson(ROOMS_INDEX_DOC_KEY, Array.from(map.values()));
        await idbSaveRooms([updatedRoom]);
      }
    }
  }

  // ===========================================================================
  // INCOMING REALTIME EVENT HANDLERS
  // ===========================================================================

  private async handleIncomingBroadcastMessage(room: ChatRoom, message: ChatMessage) {
    if (!this.currentSession?.username) return;
    const me = this.currentSession.username.trim().toLowerCase();
    if (!this.isUserInRoom(room, me)) return;

    const existingMsgs = this.state.messagesByRoom[room.id] || (await idbGetRoomMessages(room.id));
    const alreadyExists = existingMsgs.some((m) => m.id === message.id);
    const mergedMsgs = mergeMessagesIdempotent(existingMsgs, [message]);
    this.state.messagesByRoom[room.id] = mergedMsgs;
    await idbSaveRoomMessages(room.id, mergedMsgs);

    const isCurrentlyViewingRoom =
      this.state.activeRoomId === room.id &&
      (this.state.isFloatingOpen ||
        (typeof window !== 'undefined' &&
          ((window as any).__wms_active_page === 'live_chat' ||
            window.location.pathname.includes('live-chat'))));

    let finalRoom = room;
    if (isCurrentlyViewingRoom && message.sender_username.toLowerCase() !== me) {
      // Auto mark as read immediately!
      await this.markRoomAsRead(room.id);
    } else {
      const rIdx = this.state.rooms.findIndex((r) => r.id === room.id);
      if (rIdx >= 0) {
        this.state.rooms[rIdx] = finalRoom;
      } else {
        this.state.rooms.unshift(finalRoom);
      }
      this.state.rooms.sort((a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a));
      await idbSaveRooms([finalRoom]);
    }

    // Always notify UI listeners so active chat room re-renders with new message (text/photo) instantly
    this.notify();

    // Trigger audio, toast & system notification if sent by someone else and not actively viewing
    if (
      !alreadyExists &&
      message.sender_username.toLowerCase() !== me &&
      !isCurrentlyViewingRoom &&
      !this.notifiedMessageIds.has(message.id)
    ) {
      this.notifiedMessageIds.add(message.id);
      savePersistedNotifiedOrderIds(this.notifiedMessageIds);
      void syncNotifiedOrdersToServiceWorker(Array.from(this.notifiedMessageIds));

      playNewTaskChime();
      vibrateDevice([200, 100, 200]);
      this.state.incomingToastMessage = { message, room: finalRoom };
      this.incomingListeners.forEach((fn) => {
        try {
          fn(finalRoom, message);
        } catch {}
      });

      const textLower = (message.text || '').toLowerCase();
      const isMentioned =
        (Array.isArray(message.mentions) && (message.mentions.includes(me) || message.mentions.includes('semua') || message.mentions.includes('all'))) ||
        textLower.includes(`@${me}`) ||
        textLower.includes('@semua') ||
        textLower.includes('@all');

      const notifTitle = isMentioned
        ? `🔔 [${finalRoom.name || 'Grup'}] ${message.sender_name} menandai Anda!`
        : finalRoom.type === 'group'
        ? `💬 [${finalRoom.name}] ${message.sender_name}`
        : `💬 Pesan dari ${message.sender_name}`;
      void showPushNotification(notifTitle, {
        body: message.text || '📷 Mengirim lampiran foto',
        tag: `wms-chat-${finalRoom.id}`,
        url: '/live-chat',
        page: 'live_chat',
        roomId: finalRoom.id,
        roomName: finalRoom.name || message.sender_name,
        actions: [
          {
            action: 'chat_reply',
            type: 'text',
            title: '💬 Balas Cepat',
            placeholder: 'Ketik balasan pesan...',
          },
          {
            action: 'chat_mark_read',
            title: '✓✓ Tandai Dibaca',
          },
        ],
      });
    }

    this.notify();
  }

  private async handleIncomingMessageUpdate(
    roomId: string,
    updatedMessage: ChatMessage,
    updatedRoom?: ChatRoom
  ) {
    if (!this.currentSession?.username) return;
    const me = this.currentSession.username.trim().toLowerCase();

    const existingMsgs = this.state.messagesByRoom[roomId] || (await idbGetRoomMessages(roomId));
    const merged = mergeMessagesIdempotent(existingMsgs, [updatedMessage]);
    this.state.messagesByRoom[roomId] = merged;
    await idbSaveRoomMessages(roomId, merged);

    if (updatedRoom && this.isUserInRoom(updatedRoom, me)) {
      const rIdx = this.state.rooms.findIndex((r) => r.id === roomId);
      if (rIdx >= 0) {
        this.state.rooms[rIdx] = updatedRoom;
      }
      await idbSaveRooms([updatedRoom]);
    }

    this.notify();
  }

  private async handleIncomingReadReceipt(roomId: string, reader: ChatReadReceipt) {
    const existingMsgs = this.state.messagesByRoom[roomId] || (await idbGetRoomMessages(roomId));
    if (existingMsgs.length === 0) return;

    const readerUser = reader.username.toLowerCase();
    let changed = false;

    const nextMsgs = existingMsgs.map((m) => {
      const hasRead = Array.isArray(m.read_by) && m.read_by.some((r) => r.username.toLowerCase() === readerUser);
      if (hasRead) return m;
      changed = true;
      return {
        ...m,
        read_by: [...(m.read_by || []), reader],
      };
    });

    if (changed) {
      this.state.messagesByRoom[roomId] = nextMsgs;
      await idbSaveRoomMessages(roomId, nextMsgs);
      this.notify();
    }
  }

  private async handleIncomingRoomUpsert(room: ChatRoom) {
    if (!this.currentSession?.username) return;
    const me = this.currentSession.username.trim().toLowerCase();
    if (!this.isUserInRoom(room, me)) {
      // If current user was removed from group
      this.state.rooms = this.state.rooms.filter((r) => r.id !== room.id);
      if (this.state.activeRoomId === room.id) {
        this.state.activeRoomId = null;
      }
      this.notify();
      return;
    }

    const rIdx = this.state.rooms.findIndex((r) => r.id === room.id);
    const isBrandNewRoom = rIdx < 0;
    if (rIdx >= 0) {
      this.state.rooms[rIdx] = room;
    } else {
      this.state.rooms.unshift(room);
    }
    this.state.rooms.sort((a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a));
    await idbSaveRooms([room]);

    if (isBrandNewRoom && room.type === 'group' && room.created_by.toLowerCase() !== me) {
      playNewTaskChime();
    }

    this.notify();
  }

  private async handleIncomingRoomDeleted(roomId: string) {
    this.state.rooms = this.state.rooms.filter((r) => r.id !== roomId);
    delete this.state.messagesByRoom[roomId];
    if (this.state.activeRoomId === roomId) {
      this.state.activeRoomId = null;
    }
    await idbDeleteRoom(roomId);
    this.notify();
  }
}

export const liveChatManager = new LiveChatManager();
