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
const ROOMS_TOMBSTONE_DOC_KEY = 'wms_chat_deleted_rooms_v1';
const ROOM_MSGS_DOC_PREFIX = 'wms_chat_room_msgs_';
const LOCAL_TOMBSTONES_STORAGE_KEY = 'wms_chat_deleted_rooms_cache_v1';

const IDB_NAME = 'wms_live_chat_idb_v1';
const IDB_VERSION = 1;
const STORE_ROOMS = 'chat_rooms';
const STORE_MESSAGES = 'chat_messages'; // keyed by room_id -> ChatMessage[]

function loadLocalDeletedTombstones(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(LOCAL_TOMBSTONES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveLocalDeletedTombstones(map: Record<string, string>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LOCAL_TOMBSTONES_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function isSelfDirectRoom(room: ChatRoom | null | undefined): boolean {
  if (!room || !room.id) return true;
  if (room.type !== 'direct') return false;
  if (/^direct_([a-z0-9_-]+)_\1$/i.test(room.id)) return true;
  const uniqueParticipants = new Set(
    (Array.isArray(room.participants) ? room.participants : [])
      .map((p) => String(p || '').trim().toLowerCase())
      .filter(Boolean)
  );
  return uniqueParticipants.size < 2;
}

export function isRoomDeletedByTombstone(
  room: ChatRoom | null | undefined,
  tombstones: Record<string, string>
): boolean {
  if (!room || !room.id) return true;
  if (isSelfDirectRoom(room)) return true;
  const deletedAtIso = tombstones[room.id];
  if (!deletedAtIso) return false;
  const deletedMs = new Date(deletedAtIso).getTime();
  if (!Number.isFinite(deletedMs) || deletedMs <= 0) return false;
  const createdMs = room.created_at ? new Date(room.created_at).getTime() : 0;
  // If the room was created BEFORE or AT the deletion timestamp, it is deleted.
  // If a direct room was re-created AFTER the deletion timestamp, it is valid.
  return !Number.isFinite(createdMs) || createdMs <= deletedMs;
}

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

/**
 * Authoritatively reconciles IndexedDB rooms with the server's active rooms list.
 * Any room present in local IndexedDB that is no longer in `authoritativeRooms`
 * is purged from both STORE_ROOMS and STORE_MESSAGES so deleted chats never resurrect on other devices.
 */
async function idbReconcileAuthoritativeRooms(
  authoritativeRooms: ChatRoom[],
  tombstones: Record<string, string> = {}
): Promise<string[]> {
  const purgedRoomIds: string[] = [];
  try {
    const db = await openChatIdb();
    const existingRooms = await idbGetRooms();
    const validIds = new Set(authoritativeRooms.map((r) => r.id));

    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_ROOMS, STORE_MESSAGES], 'readwrite');
      const roomStore = tx.objectStore(STORE_ROOMS);
      const msgStore = tx.objectStore(STORE_MESSAGES);

      for (const oldRoom of existingRooms) {
        if (!oldRoom?.id) continue;
        if (!validIds.has(oldRoom.id) || isRoomDeletedByTombstone(oldRoom, tombstones)) {
          roomStore.delete(oldRoom.id);
          msgStore.delete(oldRoom.id);
          purgedRoomIds.push(oldRoom.id);
        }
      }

      for (const r of authoritativeRooms) {
        if (r?.id && !isRoomDeletedByTombstone(r, tombstones)) {
          roomStore.put(r);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
  return purgedRoomIds;
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
function mergeMessagesIdempotent(
  existing: ChatMessage[],
  incoming: ChatMessage[],
  minCreatedAtMs = 0
): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of existing) {
    if (!m || !m.id) continue;
    if (minCreatedAtMs > 0) {
      const ms = new Date(m.created_at).getTime();
      if (Number.isFinite(ms) && ms <= minCreatedAtMs) continue;
    }
    map.set(m.id, m);
  }
  for (const m of incoming) {
    if (!m || !m.id) continue;
    if (minCreatedAtMs > 0) {
      const ms = new Date(m.created_at).getTime();
      if (Number.isFinite(ms) && ms <= minCreatedAtMs) continue;
    }
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
      const isDeleted = Boolean(prev.is_deleted || m.is_deleted);
      map.set(m.id, {
        ...prev,
        ...m,
        text: isDeleted ? '' : (m.text ?? prev.text),
        attachment_url: isDeleted ? undefined : (m.attachment_url ?? prev.attachment_url),
        context_tags: isDeleted ? undefined : (m.context_tags ?? prev.context_tags),
        order_context: isDeleted ? undefined : (m.order_context ?? prev.order_context),
        read_by: Array.from(readMap.values()),
        is_edited: Boolean(prev.is_edited || m.is_edited),
        is_deleted: isDeleted,
        deleted_at: m.deleted_at || prev.deleted_at,
        deleted_by: m.deleted_by || prev.deleted_by,
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
    const rawKey = String(docKey || '').trim();
    const cleanKey = encodeURIComponent(rawKey);
    if (!cleanKey) return null;
    const rows = await supabaseFetch<Array<{ section_id?: string; doc_key?: string; content: any }>>(
      'wms_system_docs',
      'GET',
      null,
      `select=section_id,doc_key,content&or=(section_id.eq.${cleanKey},doc_key.eq.${cleanKey})&limit=5`
    );
    if (Array.isArray(rows) && rows.length > 0) {
      const matched = rows.find((r) => r && (r.section_id === rawKey || r.doc_key === rawKey));
      if (matched && matched.content !== undefined) {
        const raw = matched.content;
        if (typeof raw === 'string') {
          try {
            return JSON.parse(raw) as T;
          } catch {
            return null;
          }
        }
        return raw as T;
      }
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
  private crossTabChannel: BroadcastChannel | null = null;
  private clientInstanceId = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  private deletedRoomTombstones: Record<string, string> = loadLocalDeletedTombstones();
  private pendingUpsertRooms = new Map<string, ChatRoom>();
  private recentlyUpsertedRooms = new Map<string, { room: ChatRoom; expiresAt: number }>();
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
    this.syncAppBadge(total);
  }

  private lastBadgeCount = -1;

  /** Badge angka di ikon aplikasi (PWA Android/iPhone terpasang/PC) bila didukung browser */
  private syncAppBadge(count: number) {
    if (count === this.lastBadgeCount) return;
    this.lastBadgeCount = count;
    try {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (!nav) return;
      if (count > 0 && typeof nav.setAppBadge === 'function') {
        void nav.setAppBadge(count).catch(() => {});
      } else if (count === 0 && typeof nav.clearAppBadge === 'function') {
        void nav.clearAppBadge().catch(() => {});
      }
    } catch {}
  }

  public isUserInRoom(room: ChatRoom, username?: string): boolean {
    if (!room || isSelfDirectRoom(room)) return false;
    const u = String(username || this.currentSession?.username || '').trim().toLowerCase();
    if (!u) return false;
    // Defensive check: Group creator is ALWAYS considered a member of their created group room
    if (room.type === 'group' && String(room.created_by || '').trim().toLowerCase() === u) {
      return true;
    }
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
    if (this.state.allUsersDirectory.length === 0) {
      await this.refreshUsersDirectory();
    }

    const me = this.currentSession.username.trim().toLowerCase();
    const isWarehouseSide = me === 'warehouse' || me === 'admwh' || me === 'chocoadm';

    let targetProfile: ChatParticipantProfile | undefined;

    if (isWarehouseSide) {
      const storeHint = String(orderData.store_name || '').trim().toLowerCase();
      // Extract store code from order_id e.g. MSSPM-261101-TP7A -> spm -> chocospm
      const codeMatch = String(orderData.order_id || '').match(/^MS([A-Z]{2,6})[-_]/i);
      const storeCode = codeMatch ? codeMatch[1].toLowerCase() : '';
      const candidateUsername = storeCode ? `choco${storeCode}` : '';

      targetProfile = this.state.allUsersDirectory.find((u) => {
        const uLower = u.username.toLowerCase();
        if (uLower === me) return false;
        if (candidateUsername && uLower === candidateUsername) return true;
        if (storeHint) {
          if (uLower === storeHint || uLower === storeHint.replace(/\s+/g, '_')) return true;
          if (u.name.toLowerCase() === storeHint || u.name.toLowerCase().includes(storeHint)) return true;
          if (u.store_name && u.store_name.toLowerCase() === storeHint) return true;
        }
        return false;
      });

      if (!targetProfile && candidateUsername && candidateUsername !== me) {
        targetProfile = {
          username: candidateUsername,
          name: orderData.store_name || candidateUsername.toUpperCase(),
          role: 'Store',
          store_name: orderData.store_name,
        };
      }
    } else {
      targetProfile =
        this.state.allUsersDirectory.find((u) => u.username.toLowerCase() === 'warehouse') || {
          username: 'warehouse',
          name: 'Warehouse (Gudang Pusat)',
          role: 'Superadmin',
        };
    }

    this.pendingOrderContext = orderData;
    this.setFloatingOpen(true);

    if (!targetProfile || targetProfile.username.toLowerCase() === me) {
      // Do NOT create a self-chat room if store target could not be resolved; just open Live Chat
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('wms_navigate_page', { detail: { page: 'live_chat' } })
        );
      }
      return;
    }

    const room = await this.openOrCreateDirectRoom(targetProfile);
    if (room) {
      await this.selectRoom(room.id);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('wms_navigate_page', { detail: { page: 'live_chat' } })
        );
        window.dispatchEvent(
          new CustomEvent('wms_open_live_chat_room', {
            detail: { roomId: room.id, openFullPage: true },
          })
        );
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
    this.deletedRoomTombstones = loadLocalDeletedTombstones();
    this.notifiedMessageIds = new Set<string>(loadPersistedNotifiedOrderIds());

    // 1. Load cached rooms from IndexedDB immediately (0 ms, 0 egress), filtering out any locally known deleted rooms
    const cachedRooms = await idbGetRooms();
    const myCachedRooms = cachedRooms
      .filter((r) => this.isUserInRoom(r, username) && !isRoomDeletedByTombstone(r, this.deletedRoomTombstones))
      .sort((a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a));

    if (myCachedRooms.length > 0) {
      this.state.rooms = myCachedRooms;
      this.notify();
    }

    // 2. Connect to Supabase Realtime Channel (Presence + Broadcast + wms_system_docs changes)
    this.setupRealtimeChannel(session, activePage);
    this.setupBackgroundSyncLoop();

    // 3. Load user directory and sync authoritative rooms index from wms_system_docs
    void this.refreshUsersDirectory();
    await this.syncRoomsFromServer(false);
    this.hasSeededUnread = true;
  }

  private setupBackgroundSyncLoop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    // Periodic background sync + Presence Heartbeat (menjaga status & hapus chat tetap sinkron di HP & Laptop)
    this.syncTimer = setInterval(() => {
      if (this.currentSession?.username && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void this.syncRoomsFromServer(true);
        this.trackPresence();
      }
    }, 8000);

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window && !this.crossTabChannel) {
      try {
        this.crossTabChannel = new BroadcastChannel('wms_live_chat_sync_v1');
        this.crossTabChannel.onmessage = (ev: MessageEvent) => {
          const data = ev.data;
          if (!data || data.clientInstanceId === this.clientInstanceId) return;
          if (data.type === 'ROOM_DELETED' && data.roomId) {
            void this.handleIncomingRoomDeleted(String(data.roomId), data.deletedAt);
          } else if (data.type === 'ROOM_UPSERTED' && data.room) {
            void this.handleIncomingRoomUpsert(data.room as ChatRoom);
          } else if (data.type === 'MESSAGE_UPDATED' && data.roomId && data.message) {
            void this.handleIncomingMessageUpdate(
              String(data.roomId),
              data.message as ChatMessage,
              data.room as ChatRoom | undefined
            );
          }
        };
      } catch {}
    }

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
          this.trackPresence();
        }
      });
      window.addEventListener('focus', () => {
        if (this.currentSession?.username) {
          void this.syncRoomsFromServer(true);
          this.trackPresence();
        }
      });
    }
  }

  private getRoomSortTime(room: ChatRoom): number {
    const ts = room.last_message_at || room.updated_at || room.created_at;
    const ms = ts ? new Date(ts).getTime() : 0;
    return Number.isFinite(ms) ? ms : 0;
  }

  private getMinValidMessageTimeMs(roomId: string, room?: ChatRoom | null): number {
    let minMs = 0;
    const deletedIso = this.deletedRoomTombstones[roomId];
    if (deletedIso) {
      const dMs = new Date(deletedIso).getTime();
      if (Number.isFinite(dMs) && dMs > minMs) {
        minMs = dMs;
      }
    }
    const targetRoom = room || this.state.rooms.find((r) => r.id === roomId);
    if (targetRoom?.type === 'direct' && targetRoom.created_at && deletedIso) {
      // If a direct room was re-created after a previous deletion, any message prior to its new created_at is stale
      const cMs = new Date(targetRoom.created_at).getTime();
      if (Number.isFinite(cMs) && cMs > minMs) {
        minMs = cMs - 1000;
      }
    }
    return minMs;
  }

  private cleanupChannel() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.crossTabChannel) {
      try {
        this.crossTabChannel.close();
      } catch {}
      this.crossTabChannel = null;
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
      // CRITICAL: broadcast.self = true ensures that when the SAME account is logged in on both
      // Laptop and HP (sharing the same presence key `username`), broadcast events are always
      // delivered to all connected devices of that user. We filter out our own tab via clientInstanceId.
      const ch = client.channel('wms-live-chat-v1', {
        config: {
          presence: { key: username },
          broadcast: { self: true },
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
        if (data.clientInstanceId && data.clientInstanceId === this.clientInstanceId) return;
        void this.handleIncomingBroadcastMessage(data.room as ChatRoom, data.message as ChatMessage);
      });

      // Broadcast Event 2: Message Edited or Deleted
      ch.on('broadcast', { event: 'chat:message_updated' }, (payload: any) => {
        const data = payload?.payload;
        if (!data || !data.message || !data.roomId) return;
        if (data.clientInstanceId && data.clientInstanceId === this.clientInstanceId) return;
        void this.handleIncomingMessageUpdate(
          String(data.roomId),
          data.message as ChatMessage,
          data.room as ChatRoom | undefined
        );
      });

      // Broadcast Event 3: Messages Read (✓✓)
      ch.on('broadcast', { event: 'chat:messages_read' }, (payload: any) => {
        const data = payload?.payload;
        if (!data || !data.roomId || !data.reader) return;
        if (data.clientInstanceId && data.clientInstanceId === this.clientInstanceId) return;
        void this.handleIncomingReadReceipt(String(data.roomId), data.reader as ChatReadReceipt);
      });

      // Broadcast Event 4: Room Created / Updated / Deleted
      ch.on('broadcast', { event: 'chat:room_updated' }, (payload: any) => {
        const data = payload?.payload;
        if (!data) return;
        if (data.clientInstanceId && data.clientInstanceId === this.clientInstanceId) return;
        if (data.deletedRoomId) {
          void this.handleIncomingRoomDeleted(String(data.deletedRoomId), data.deletedAt);
        } else if (data.room) {
          void this.handleIncomingRoomUpsert(data.room as ChatRoom);
        }
      });

      // Postgres Changes Event 5: Listen to wms_system_docs updates (multi-device DB sync)
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wms_system_docs' },
        (payload: any) => {
          const docKey = String(
            payload?.new?.doc_key ||
              payload?.new?.section_id ||
              payload?.old?.doc_key ||
              payload?.old?.section_id ||
              ''
          );
          if (docKey === ROOMS_INDEX_DOC_KEY || docKey === ROOMS_TOMBSTONE_DOC_KEY) {
            void this.syncRoomsFromServer(true);
          } else if (docKey.startsWith(ROOM_MSGS_DOC_PREFIX)) {
            const changedRoomId = docKey.slice(ROOM_MSGS_DOC_PREFIX.length);
            if (
              changedRoomId &&
              (this.state.activeRoomId === changedRoomId || Boolean(this.state.messagesByRoom[changedRoomId]))
            ) {
              void this.syncRoomMessagesFromServer(changedRoomId);
            }
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
        const rawName = String(u.name || '').trim();
        const resolvedName =
          rawName && rawName.toLowerCase() !== uname
            ? rawName
            : getUserPersonName(uname) || rawName || u.store_name || uname;
        map.set(uname, {
          username: uname,
          name: resolvedName,
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
   * Syncs the authoritative rooms index and deletion tombstones from wms_system_docs.
   * Ensures any room deleted on Laptop is immediately removed from HP's state & IndexedDB.
   */
  public async syncRoomsFromServer(triggerNotification = false): Promise<ChatRoom[]> {
    if (!this.currentSession?.username) return [];
    const me = this.currentSession.username.trim().toLowerCase();
    this.state.isLoadingRooms = true;
    this.notify();

    try {
      const [serverRooms, serverTombstones] = await Promise.all([
        fetchSystemDocJson<ChatRoom[]>(ROOMS_INDEX_DOC_KEY),
        fetchSystemDocJson<Record<string, string>>(ROOMS_TOMBSTONE_DOC_KEY),
      ]);

      if (serverTombstones && typeof serverTombstones === 'object') {
        for (const [rid, ts] of Object.entries(serverTombstones)) {
          if (!rid || typeof ts !== 'string') continue;
          const prevTs = this.deletedRoomTombstones[rid];
          if (!prevTs || new Date(ts).getTime() > new Date(prevTs).getTime()) {
            this.deletedRoomTombstones[rid] = ts;
          }
        }
        saveLocalDeletedTombstones(this.deletedRoomTombstones);
      }

      const roomMap = new Map<string, ChatRoom>();

      if (Array.isArray(serverRooms)) {
        // Server index is authoritative! Only include rooms present on the server (that aren't deleted by a newer tombstone)
        for (const r of serverRooms) {
          if (r?.id && !isRoomDeletedByTombstone(r, this.deletedRoomTombstones)) {
            if (this.deletedRoomTombstones[r.id]) {
              delete this.deletedRoomTombstones[r.id];
              saveLocalDeletedTombstones(this.deletedRoomTombstones);
            }
            roomMap.set(r.id, r);
          }
        }
        // Plus any room currently in the middle of an optimistic upsert on this device
        for (const [id, pendingRoom] of this.pendingUpsertRooms.entries()) {
          if (!isRoomDeletedByTombstone(pendingRoom, this.deletedRoomTombstones)) {
            roomMap.set(id, pendingRoom);
          }
        }
        // Plus any room created/upserted within the last 20 seconds so overlapping background polls never purge a newly opened chat
        const nowMs = Date.now();
        for (const [id, entry] of this.recentlyUpsertedRooms.entries()) {
          if (nowMs > entry.expiresAt) {
            this.recentlyUpsertedRooms.delete(id);
            continue;
          }
          if (!roomMap.has(id) && !isRoomDeletedByTombstone(entry.room, this.deletedRoomTombstones)) {
            roomMap.set(id, entry.room);
          }
        }
      } else {
        // Offline / fallback only when server doc could not be fetched
        for (const r of this.state.rooms) {
          if (r?.id && !isRoomDeletedByTombstone(r, this.deletedRoomTombstones)) {
            roomMap.set(r.id, r);
          }
        }
      }

      const allAuthoritative = Array.from(roomMap.values());

      if (Array.isArray(serverRooms)) {
        // Purge any rooms from local IndexedDB & memory that were deleted on another device
        const purgedRoomIds = await idbReconcileAuthoritativeRooms(
          allAuthoritative,
          this.deletedRoomTombstones
        );
        for (const purgedId of purgedRoomIds) {
          delete this.state.messagesByRoom[purgedId];
        }
        // Also clean any in-memory rooms that are no longer in roomMap
        for (const prevRoom of this.state.rooms) {
          if (prevRoom?.id && !roomMap.has(prevRoom.id)) {
            delete this.state.messagesByRoom[prevRoom.id];
            await idbDeleteRoom(prevRoom.id);
          }
        }
      } else {
        await idbSaveRooms(allAuthoritative);
      }

      const myRooms = allAuthoritative
        .filter((r) => this.isUserInRoom(r, me))
        .sort((a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a));

      // If the currently active room was deleted on another device (or user was removed), close it cleanly
      if (this.state.activeRoomId && !myRooms.some((r) => r.id === this.state.activeRoomId)) {
        delete this.state.messagesByRoom[this.state.activeRoomId];
        this.state.activeRoomId = null;
      }

      const isOnLiveChatPage =
        typeof window !== 'undefined' && window.location.pathname.includes('live-chat');

      for (const r of myRooms) {
        const lastMsgId = String(r.last_message_id || '').trim();
        if (!lastMsgId) continue;
        const lastSender = String(r.last_message_sender || '').trim().toLowerCase();
        const isUnread =
          Array.isArray(r.unread_by) && r.unread_by.some((u) => String(u || '').toLowerCase() === me);

        if (!this.hasSeededUnread && !triggerNotification) {
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

      // Also delta-sync messages for the currently open room so message deletions/edits sync across devices
      if (this.state.activeRoomId) {
        void this.syncRoomMessagesFromServer(this.state.activeRoomId);
      }

      return myRooms;
    } catch {
      this.state.isLoadingRooms = false;
      this.notify();
      return this.state.rooms;
    }
  }

  /**
   * Syncs messages for a specific room from Supabase and reconciles deletions/edits with local IndexedDB
   */
  public async syncRoomMessagesFromServer(roomId: string): Promise<void> {
    if (!roomId) return;
    const room = this.state.rooms.find((r) => r.id === roomId);
    if (room && isRoomDeletedByTombstone(room, this.deletedRoomTombstones)) {
      await this.handleIncomingRoomDeleted(roomId, this.deletedRoomTombstones[roomId]);
      return;
    }

    try {
      const [localMsgs, hotMsgs] = await Promise.all([
        idbGetRoomMessages(roomId),
        fetchSystemDocJson<ChatMessage[]>(`${ROOM_MSGS_DOC_PREFIX}${roomId}`),
      ]);

      const minValidMs = this.getMinValidMessageTimeMs(roomId, room);

      if (Array.isArray(hotMsgs)) {
        const hasColdArchives = Boolean(room && Array.isArray(room.archive_urls) && room.archive_urls.length > 0);
        const nowMs = Date.now();
        const hasVeryRecentLocal = localMsgs.some((m) => {
          const ms = new Date(m.created_at).getTime();
          return Number.isFinite(ms) && nowMs - ms < 20_000;
        });
        // If server hot store is empty and there are no cold archives or in-flight local messages, clear messages
        if (hotMsgs.length === 0 && !hasColdArchives && !hasVeryRecentLocal) {
          this.state.messagesByRoom[roomId] = [];
          await idbSaveRoomMessages(roomId, []);
        } else {
          const merged = mergeMessagesIdempotent(localMsgs, hotMsgs, minValidMs);
          this.state.messagesByRoom[roomId] = merged;
          await idbSaveRoomMessages(roomId, merged);
        }
        this.notify();
      }
    } catch {}
  }

  /**
   * Opens a room, loads permanent local IndexedDB messages immediately, and delta-syncs hot messages from Supabase
   */
  public async selectRoom(roomId: string | null): Promise<void> {
    if (!roomId) {
      this.state.activeRoomId = null;
      this.notify();
      return;
    }

    const room = this.state.rooms.find((r) => r.id === roomId);
    if (room && isRoomDeletedByTombstone(room, this.deletedRoomTombstones)) {
      await this.handleIncomingRoomDeleted(roomId, this.deletedRoomTombstones[roomId]);
      return;
    }

    this.state.activeRoomId = roomId;
    const minValidMs = this.getMinValidMessageTimeMs(roomId, room);

    // 1. Load permanent local messages from IndexedDB (0 ms, 0 egress)
    const rawLocalMsgs = await idbGetRoomMessages(roomId);
    const localMsgs =
      minValidMs > 0
        ? rawLocalMsgs.filter((m) => {
            const ms = new Date(m.created_at).getTime();
            return Number.isFinite(ms) && ms > minValidMs;
          })
        : rawLocalMsgs;

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
        const hasColdArchives = Boolean(room && Array.isArray(room.archive_urls) && room.archive_urls.length > 0);
        const nowMs = Date.now();
        const hasVeryRecentLocal = localMsgs.some((m) => {
          const ms = new Date(m.created_at).getTime();
          return Number.isFinite(ms) && nowMs - ms < 20_000;
        });
        if (hotMsgs.length === 0 && !hasColdArchives && !hasVeryRecentLocal) {
          this.state.messagesByRoom[roomId] = [];
          await idbSaveRoomMessages(roomId, []);
        } else {
          const merged = mergeMessagesIdempotent(localMsgs, hotMsgs, minValidMs);
          this.state.messagesByRoom[roomId] = merged;
          await idbSaveRoomMessages(roomId, merged);
        }
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

    const minValidMs = this.getMinValidMessageTimeMs(roomId, room);
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
            merged = mergeMessagesIdempotent(merged, archivedBatch, minValidMs);
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
    if (!me || !other || me === other) return null;

    const sortedPair = [me, other].sort();
    const directRoomId = `direct_${sortedPair[0]}_${sortedPair[1]}`;

    const existing = this.state.rooms.find(
      (r) => r.id === directRoomId && !isRoomDeletedByTombstone(r, this.deletedRoomTombstones)
    );
    if (existing) {
      this.state.activeRoomId = existing.id;
      this.notify();
      await this.selectRoom(existing.id);
      return existing;
    }

    const myName =
      this.currentSession.name ||
      getUserPersonName(me) ||
      this.currentSession.store_name ||
      me;

    const prevDeletedIso = this.deletedRoomTombstones[directRoomId];
    const prevDeletedMs = prevDeletedIso ? new Date(prevDeletedIso).getTime() : 0;
    const safeNowMs = Math.max(Date.now(), Number.isFinite(prevDeletedMs) ? prevDeletedMs + 2000 : 0);
    const now = new Date(safeNowMs).toISOString();

    if (this.deletedRoomTombstones[directRoomId]) {
      delete this.deletedRoomTombstones[directRoomId];
      saveLocalDeletedTombstones(this.deletedRoomTombstones);
    }

    const otherDisplayName =
      targetUser.name && targetUser.name.trim().toLowerCase() !== other
        ? targetUser.name.trim()
        : getUserPersonName(other) || targetUser.name || other;

    const newRoom: ChatRoom = {
      id: directRoomId,
      type: 'direct',
      name: otherDisplayName,
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
          name: otherDisplayName,
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

    // Optimistically activate room in 0ms so UI switches to the chat conversation immediately
    this.pendingUpsertRooms.set(directRoomId, newRoom);
    this.recentlyUpsertedRooms.set(directRoomId, {
      room: newRoom,
      expiresAt: Date.now() + 20_000,
    });
    this.state.messagesByRoom[directRoomId] = [];
    const existingIdx = this.state.rooms.findIndex((r) => r.id === directRoomId);
    if (existingIdx >= 0) {
      this.state.rooms[existingIdx] = newRoom;
    } else {
      this.state.rooms.unshift(newRoom);
    }
    this.state.rooms.sort((a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a));
    this.state.activeRoomId = newRoom.id;
    this.notify();

    // Ensure any stale local messages from a previously deleted conversation with this ID are wiped first
    await idbDeleteRoom(directRoomId);
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
    updatedTopic?: string,
    allowSelfRemoval: boolean = false
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

    const creator = String(room.created_by || '').trim().toLowerCase();
    const cleanList = participantUsernames.map((u) => u.trim().toLowerCase()).filter(Boolean);

    // CRITICAL: Creator dan user yang sedang mengedit TIDAK BOLEH terlepas secara tidak sengaja
    // kecuali jika aksi ini adalah pemanggilan eksplisit leaveGroupRoom (allowSelfRemoval = true)
    const membersToInclude = allowSelfRemoval
      ? cleanList
      : [
          ...(creator ? [creator] : []),
          me,
          ...cleanList,
        ];

    const uniqueMembers = Array.from(new Set(membersToInclude));

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
    return this.updateGroupMembers(roomId, remaining, room.name, room.topic, true);
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

    const deletedAt = new Date().toISOString();
    this.deletedRoomTombstones[roomId] = deletedAt;
    saveLocalDeletedTombstones(this.deletedRoomTombstones);
    this.pendingUpsertRooms.delete(roomId);
    this.recentlyUpsertedRooms.delete(roomId);

    // 1. Optimistic local state + IndexedDB removal
    this.state.rooms = this.state.rooms.filter((r) => r.id !== roomId);
    delete this.state.messagesByRoom[roomId];
    if (this.state.activeRoomId === roomId) {
      this.state.activeRoomId = null;
    }
    this.notify();

    await idbDeleteRoom(roomId);

    // 2. Broadcast immediately to all other devices (including same-account HP/Laptop & other participants)
    try {
      this.channel?.send({
        type: 'broadcast',
        event: 'chat:room_updated',
        payload: {
          deletedRoomId: roomId,
          deletedAt,
          clientInstanceId: this.clientInstanceId,
        },
      });
    } catch {}

    try {
      this.crossTabChannel?.postMessage({
        type: 'ROOM_DELETED',
        roomId,
        deletedAt,
        clientInstanceId: this.clientInstanceId,
      });
    } catch {}

    // 3. Persist deletion tombstone & updated rooms index to Supabase wms_system_docs
    const [serverRooms, serverTombstones] = await Promise.all([
      fetchSystemDocJson<ChatRoom[]>(ROOMS_INDEX_DOC_KEY),
      fetchSystemDocJson<Record<string, string>>(ROOMS_TOMBSTONE_DOC_KEY),
    ]);

    const mergedTombstones: Record<string, string> = {
      ...(serverTombstones && typeof serverTombstones === 'object' ? serverTombstones : {}),
      ...this.deletedRoomTombstones,
      [roomId]: deletedAt,
    };
    this.deletedRoomTombstones = mergedTombstones;
    saveLocalDeletedTombstones(mergedTombstones);

    const remaining = (Array.isArray(serverRooms) ? serverRooms : []).filter(
      (r) => r && r.id !== roomId && !isRoomDeletedByTombstone(r, mergedTombstones)
    );

    await Promise.all([
      saveSystemDocJson(ROOMS_TOMBSTONE_DOC_KEY, mergedTombstones),
      saveSystemDocJson(ROOMS_INDEX_DOC_KEY, remaining),
      saveSystemDocJson(`${ROOM_MSGS_DOC_PREFIX}${roomId}`, []),
    ]);

    return { success: true };
  }

  public async deleteGroupRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    return this.deleteChatRoom(roomId);
  }

  private async upsertRoomToServer(room: ChatRoom): Promise<void> {
    this.pendingUpsertRooms.set(room.id, room);
    this.recentlyUpsertedRooms.set(room.id, {
      room,
      expiresAt: Date.now() + 20_000,
    });

    try {
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

      // Sync with server index WITHOUT re-inserting stale local rooms that may have been deleted on another device
      const [serverRooms, serverTombstones] = await Promise.all([
        fetchSystemDocJson<ChatRoom[]>(ROOMS_INDEX_DOC_KEY),
        fetchSystemDocJson<Record<string, string>>(ROOMS_TOMBSTONE_DOC_KEY),
      ]);

      let tombstoneCleaned = false;
      if (serverTombstones && typeof serverTombstones === 'object') {
        Object.assign(this.deletedRoomTombstones, serverTombstones);
        if (
          this.deletedRoomTombstones[room.id] &&
          !isRoomDeletedByTombstone(room, this.deletedRoomTombstones)
        ) {
          delete this.deletedRoomTombstones[room.id];
          tombstoneCleaned = true;
        }
        saveLocalDeletedTombstones(this.deletedRoomTombstones);
      }

      const map = new Map<string, ChatRoom>();
      for (const r of Array.isArray(serverRooms) ? serverRooms : []) {
        if (r?.id && !isRoomDeletedByTombstone(r, this.deletedRoomTombstones)) {
          map.set(r.id, r);
        }
      }
      for (const [id, pendingRoom] of this.pendingUpsertRooms.entries()) {
        if (!isRoomDeletedByTombstone(pendingRoom, this.deletedRoomTombstones)) {
          map.set(id, pendingRoom);
        }
      }
      map.set(room.id, room);

      const updatedList = Array.from(map.values()).sort(
        (a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a)
      );
      await Promise.all([
        saveSystemDocJson(ROOMS_INDEX_DOC_KEY, updatedList),
        tombstoneCleaned
          ? saveSystemDocJson(ROOMS_TOMBSTONE_DOC_KEY, this.deletedRoomTombstones)
          : Promise.resolve(),
      ]);

      try {
        this.channel?.send({
          type: 'broadcast',
          event: 'chat:room_updated',
          payload: {
            room,
            clientInstanceId: this.clientInstanceId,
          },
        });
      } catch {}

      try {
        this.crossTabChannel?.postMessage({
          type: 'ROOM_UPSERTED',
          room,
          clientInstanceId: this.clientInstanceId,
        });
      } catch {}
    } finally {
      this.pendingUpsertRooms.delete(room.id);
    }
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
    const minValidMs = this.getMinValidMessageTimeMs(room.id, room);
    const existingLocal = this.state.messagesByRoom[room.id] || (await idbGetRoomMessages(room.id));
    const updatedLocal = mergeMessagesIdempotent(existingLocal, [newMsg], minValidMs);
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

    // 2. Broadcast immediately via WebSocket for 0-latency delivery to online users & other logged-in devices
    try {
      this.channel?.send({
        type: 'broadcast',
        event: 'chat:new_message',
        payload: {
          room: updatedRoom,
          message: newMsg,
          clientInstanceId: this.clientInstanceId,
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
    this.recentlyUpsertedRooms.set(updatedRoom.id, {
      room: updatedRoom,
      expiresAt: Date.now() + 20_000,
    });
    let hotMessages = allMessages;

    if (hotMessages.length > HOT_MESSAGE_LIMIT_PER_ROOM) {
      hotMessages = hotMessages.slice(-HOT_MESSAGE_LIMIT_PER_ROOM);
    }

    const [serverRooms, serverTombstones] = await Promise.all([
      fetchSystemDocJson<ChatRoom[]>(ROOMS_INDEX_DOC_KEY),
      fetchSystemDocJson<Record<string, string>>(ROOMS_TOMBSTONE_DOC_KEY),
    ]);

    if (serverTombstones && typeof serverTombstones === 'object') {
      Object.assign(this.deletedRoomTombstones, serverTombstones);
      saveLocalDeletedTombstones(this.deletedRoomTombstones);
    }

    // If this room was deleted by another device while we were persisting, abort so we don't resurrect it
    if (isRoomDeletedByTombstone(updatedRoom, this.deletedRoomTombstones)) {
      await this.handleIncomingRoomDeleted(updatedRoom.id, this.deletedRoomTombstones[updatedRoom.id]);
      return;
    }

    await saveSystemDocJson(`${ROOM_MSGS_DOC_PREFIX}${updatedRoom.id}`, hotMessages);

    const map = new Map<string, ChatRoom>();
    for (const r of Array.isArray(serverRooms) ? serverRooms : []) {
      if (r?.id && !isRoomDeletedByTombstone(r, this.deletedRoomTombstones)) {
        map.set(r.id, r);
      }
    }
    for (const [id, pendingRoom] of this.pendingUpsertRooms.entries()) {
      if (!isRoomDeletedByTombstone(pendingRoom, this.deletedRoomTombstones)) {
        map.set(id, pendingRoom);
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
          clientInstanceId: this.clientInstanceId,
        },
      });
    } catch {}

    try {
      this.crossTabChannel?.postMessage({
        type: 'MESSAGE_UPDATED',
        roomId,
        message: updatedMsg,
        room: updatedRoom,
        clientInstanceId: this.clientInstanceId,
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
      order_context: undefined,
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
          clientInstanceId: this.clientInstanceId,
        },
      });
    } catch {}

    try {
      this.crossTabChannel?.postMessage({
        type: 'MESSAGE_UPDATED',
        roomId,
        message: deletedMsg,
        room: updatedRoom,
        clientInstanceId: this.clientInstanceId,
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
      if (isRoomDeletedByTombstone(room, this.deletedRoomTombstones)) {
        return;
      }
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
            clientInstanceId: this.clientInstanceId,
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
        const [serverRooms, serverTombstones] = await Promise.all([
          fetchSystemDocJson<ChatRoom[]>(ROOMS_INDEX_DOC_KEY),
          fetchSystemDocJson<Record<string, string>>(ROOMS_TOMBSTONE_DOC_KEY),
        ]);
        if (serverTombstones && typeof serverTombstones === 'object') {
          Object.assign(this.deletedRoomTombstones, serverTombstones);
          saveLocalDeletedTombstones(this.deletedRoomTombstones);
        }
        if (isRoomDeletedByTombstone(updatedRoom, this.deletedRoomTombstones)) {
          await this.handleIncomingRoomDeleted(updatedRoom.id, this.deletedRoomTombstones[updatedRoom.id]);
          return;
        }
        const map = new Map<string, ChatRoom>();
        for (const r of Array.isArray(serverRooms) ? serverRooms : []) {
          if (r?.id && !isRoomDeletedByTombstone(r, this.deletedRoomTombstones)) {
            map.set(r.id, r);
          }
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

    const minValidMs = this.getMinValidMessageTimeMs(room.id, room);
    const existingMsgs = this.state.messagesByRoom[room.id] || (await idbGetRoomMessages(room.id));
    const alreadyExists = existingMsgs.some((m) => m.id === message.id);
    const mergedMsgs = mergeMessagesIdempotent(existingMsgs, [message], minValidMs);
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

    const minValidMs = this.getMinValidMessageTimeMs(roomId, updatedRoom);
    const existingMsgs = this.state.messagesByRoom[roomId] || (await idbGetRoomMessages(roomId));
    const merged = mergeMessagesIdempotent(existingMsgs, [updatedMessage], minValidMs);
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
    if (isRoomDeletedByTombstone(room, this.deletedRoomTombstones)) return;
    const me = this.currentSession.username.trim().toLowerCase();
    if (!this.isUserInRoom(room, me)) {
      // If current user was removed from group
      this.state.rooms = this.state.rooms.filter((r) => r.id !== room.id);
      delete this.state.messagesByRoom[room.id];
      await idbDeleteRoom(room.id);
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

  private async handleIncomingRoomDeleted(roomId: string, deletedAt?: string) {
    const ts = deletedAt || new Date().toISOString();
    const prevTs = this.deletedRoomTombstones[roomId];
    if (!prevTs || new Date(ts).getTime() > new Date(prevTs).getTime()) {
      this.deletedRoomTombstones[roomId] = ts;
      saveLocalDeletedTombstones(this.deletedRoomTombstones);
    }
    this.pendingUpsertRooms.delete(roomId);
    this.recentlyUpsertedRooms.delete(roomId);
    this.state.rooms = this.state.rooms.filter((r) => r.id !== roomId);
    delete this.state.messagesByRoom[roomId];
    if (this.state.activeRoomId === roomId) {
      this.state.activeRoomId = null;
    }
    if (this.state.incomingToastMessage?.room?.id === roomId) {
      this.state.incomingToastMessage = null;
    }
    await idbDeleteRoom(roomId);
    this.notify();
  }
}

export const liveChatManager = new LiveChatManager();
