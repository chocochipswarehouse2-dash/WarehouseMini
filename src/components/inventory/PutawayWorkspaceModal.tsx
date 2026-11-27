import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { NumberInput } from '../common/NumberInput';
import confetti from 'canvas-confetti';
import {
  X,
  CheckCircle2,
  MapPin,
  Package,
  Printer,
  Send,
  Minimize2,
  Search,
  AlertTriangle,
  ScanBarcode,
  Camera,
  Keyboard,
  Loader2,
  Edit3,
  Plus,
  Minus,
  Trash2,
  Users,
  WifiOff,
  Check,
  Navigation,
  Sparkles,
  LogOut,
  MessageSquare,
} from 'lucide-react';
import { PhysicalScanInput } from '../PhysicalScanInput';
import { CameraScanner } from '../CameraScanner';
import type { ComputedRackSlot } from '../../services/rackCapacityService';
import {
  fetchPutawayTasks,
  joinPutawayTask,
  leavePutawayTask,
  syncPutawayTaskItems,
  cancelPutawayTask,
  completePutawayTask,
  validateSourceStockBeforeSubmit,
  subscribePutawayRealtime,
  broadcastPutawayRealtime,
  type SourceStockShortageWarning,
} from '../../services/putawayService';
import {
  saveActivePutawaySession,
  clearActivePutawaySession,
} from '../../services/scannerOutboxService';
import {
  getAreaFromLokasi,
  normalizeLokasi,
  isSameOperatorIdentity,
} from '../../services/supabase';
import {
  playSuccessBeep,
  playErrorBeep,
  playCategoryBeep,
  playSaveSuccessChime,
  vibrateDevice,
} from '../../services/audio';
import { formatOperatorWithPersonName } from '../../utils/userResolver';
import {
  printPutawayRouteA4,
  printPutawayRouteThermal,
  formatPutawayWhatsAppMessage,
} from '../../utils/putawayPrintUtils';
import {
  getFonnteConfig,
  sendFonnteMessage,
  normalizeWhatsAppNumber,
  getWhatsAppWebUrl,
} from '../../services/whatsapp';
import type {
  ProductItem,
  PutawayPlacement,
  PutawayTask,
  PutawayTaskItem,
} from '../../types';

interface PutawayWorkspaceModalProps {
  task: PutawayTask;
  allSlots: ComputedRackSlot[];
  currentUser: string;
  isAdmin: boolean;
  productCatalog?: ProductItem[];
  onMinimize: () => void;
  onCloseWorkspace: () => void;
  onTaskCompleted: (completedTask: PutawayTask, queuedOffline: boolean) => void;
  onTaskCancelled: () => void;
  onNotify?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const PutawayWorkspaceModal: React.FC<PutawayWorkspaceModalProps> = ({
  task,
  allSlots,
  currentUser,
  isAdmin,
  productCatalog = [],
  onMinimize,
  onCloseWorkspace,
  onTaskCompleted,
  onTaskCancelled,
  onNotify,
}) => {
  const [taskState, setTaskState] = useState<PutawayTask>(task);
  const taskStateRef = useRef<PutawayTask>(taskState);
  taskStateRef.current = taskState;

  const [activeTargetLoc, setActiveTargetLoc] = useState<string>('');
  const [guidedItemId, setGuidedItemId] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'fisik' | 'kamera' | 'manual'>('fisik');
  const [searchFilter, setSearchFilter] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncingItems, setIsSyncingItems] = useState(false);

  // Recent scan feed
  const [recentScans, setRecentScans] = useState<
    Array<{ id: string; time: string; ok: boolean; label: string; detail: string }>
  >([]);

  // Rack override / split modal state
  const [editingItem, setEditingItem] = useState<PutawayTaskItem | null>(null);
  const [overrideLocInput, setOverrideLocInput] = useState('');
  const [overrideSplitQty, setOverrideSplitQty] = useState<number>(1);
  const [itemNoteInput, setItemNoteInput] = useState('');

  // Rekap / Submit modal state
  const [isRekapOpen, setIsRekapOpen] = useState(false);
  const [rekapCatatan, setRekapCatatan] = useState(task.catatan || '');
  const [isValidatingStock, setIsValidatingStock] = useState(false);
  const [stockWarnings, setStockWarnings] = useState<SourceStockShortageWarning[]>([]);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const isSubmittingRef = useRef(false);
  isSubmittingRef.current = isSubmittingFinal;

  // Exit / Cancel modal state
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Sending WA state
  const [isSendingWa, setIsSendingWa] = useState(false);

  // Realtime sync guards
  const pendingLocalItemSyncRef = useRef<Map<string, number>>(new Map());
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build O(1) lookup sets for slots and SKUs
  const slotByLokasi = useMemo(() => {
    const map = new Map<string, ComputedRackSlot>();
    for (const s of allSlots) {
      map.set(s.lokasi.toUpperCase(), s);
    }
    return map;
  }, [allSlots]);

  const taskSkuSet = useMemo(() => {
    const set = new Set<string>();
    for (const it of taskState.items || []) {
      set.add(it.sku.toUpperCase());
    }
    return set;
  }, [taskState.items]);

  const catalogSkuSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of productCatalog) {
      const s = String(p?.k || (p as any)?.sku || '').trim().toUpperCase();
      if (s) set.add(s);
    }
    return set;
  }, [productCatalog]);

  const sourceLocationSet = useMemo(
    () => new Set((taskState.source_locations || []).map((l) => l.trim().toUpperCase())),
    [taskState.source_locations]
  );

  // Persist local session whenever taskState or activeTargetLoc updates
  useEffect(() => {
    if (taskState.status === 'AKTIF') {
      saveActivePutawaySession({
        taskId: taskState.id,
        task: taskState,
        activeTargetLoc,
        rekapCatatan,
        isMinimized: false,
        timestamp: Date.now(),
      });
    }
  }, [taskState, activeTargetLoc, rekapCatatan]);

  // Join task on mount so co-putaway operators see this user
  useEffect(() => {
    joinPutawayTask(task.id, currentUser)
      .then((joined) => {
        if (joined && joined.status === 'AKTIF') {
          setTaskState((prev) => ({
            ...prev,
            active_operators: joined.active_operators,
          }));
        }
      })
      .catch(() => {});
  }, [task.id, currentUser]);

  // Online/offline listeners
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const broadcastEvent = useCallback(
    (eventType: string, payload: Record<string, any> = {}) => {
      broadcastPutawayRealtime(eventType, {
        taskId: taskStateRef.current.id,
        actor: currentUser,
        ts: Date.now(),
        ...payload,
      });
    },
    [currentUser]
  );

  const applyRemoteTaskState = useCallback(
    (remote: PutawayTask | undefined, actorFromBroadcast?: string) => {
      if (!remote || remote.id !== taskStateRef.current.id) return;

      if (remote.status === 'SELESAI' && !isSubmittingRef.current) {
        clearActivePutawaySession();
        playSaveSuccessChime();
        onNotify?.(
          `✅ Tugas Putaway ${remote.invoice_putaway} telah diselesaikan oleh ${formatOperatorWithPersonName(remote.completed_by || actorFromBroadcast || 'Rekan Tim')}!`,
          'success'
        );
        onTaskCompleted(remote, false);
        return;
      }

      if (remote.status === 'DIBATALKAN') {
        clearActivePutawaySession();
        onNotify?.(
          `↺ Tugas Putaway ${remote.invoice_putaway} telah dibatalkan.`,
          'warning'
        );
        onTaskCancelled();
        return;
      }

      const now = Date.now();
      setTaskState((prev) => {
        const remoteById = new Map<string, PutawayTaskItem>();
        (remote.items || []).forEach((it) => remoteById.set(it.id, it));
        let changed = false;

        const nextItems = (prev.items || []).map((localIt) => {
          const guardedAt = pendingLocalItemSyncRef.current.get(localIt.id) || 0;
          if (now - guardedAt < 2200) return localIt;
          const remIt = remoteById.get(localIt.id);
          if (!remIt) return localIt;

          if (
            remIt.qty_placed !== localIt.qty_placed ||
            remIt.status !== localIt.status ||
            remIt.recommended_lokasi !== localIt.recommended_lokasi ||
            (remIt.updated_at || '') > (localIt.updated_at || '')
          ) {
            changed = true;
            return remIt;
          }
          return localIt;
        });

        const opsChanged =
          (remote.active_operators || []).join(',') !== (prev.active_operators || []).join(',');

        if (!changed && !opsChanged) return prev;
        return {
          ...prev,
          active_operators: remote.active_operators,
          items: changed ? nextItems : prev.items,
          updated_at: remote.updated_at,
        };
      });
    },
    [onNotify, onTaskCancelled, onTaskCompleted]
  );

  // Realtime collaboration channel + throttled polling fallback
  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerRefresh = (delayMs = 200, actor?: string) => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchPutawayTasks(true)
          .then((list) => {
            const found = list.find((t) => t.id === taskStateRef.current.id);
            applyRemoteTaskState(found, actor);
          })
          .catch(() => {});
      }, delayMs);
    };

    const unsubRealtime = subscribePutawayRealtime((evt) => {
      if (evt.kind === 'broadcast') {
        const p = evt.payload;
        if (!p || p.taskId !== taskStateRef.current.id || p.actor === currentUser) return;
        if (evt.event === 'operator_joined') {
          onNotify?.(
            `🤝 ${formatOperatorWithPersonName(p.actor)} ikut membantu Putaway ${taskStateRef.current.invoice_putaway}!`,
            'info'
          );
          triggerRefresh(150, p.actor);
        } else if (evt.event === 'task_completed' || evt.event === 'task_cancelled') {
          triggerRefresh(100, p.actor);
        } else {
          triggerRefresh(150, p.actor);
        }
      } else if (evt.kind === 'postgres_changes') {
        const changedId = evt.payload?.new?.id || evt.payload?.old?.id;
        if (changedId === taskStateRef.current.id) {
          triggerRefresh(200);
        }
      }
    });

    broadcastPutawayRealtime('operator_joined', {
      taskId: task.id,
      actor: currentUser,
      ts: Date.now(),
    });

    const poll = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      triggerRefresh(50);
    }, 30000);

    return () => {
      clearInterval(poll);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      unsubRealtime();
    };
  }, [task.id, currentUser, applyRemoteTaskState, onNotify]);

  const scheduleSyncToCloud = useCallback(
    (nextItems: PutawayTaskItem[]) => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(async () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        setIsSyncingItems(true);
        try {
          await syncPutawayTaskItems(taskStateRef.current.id, nextItems, currentUser);
          broadcastEvent('task_updated');
        } catch {
          // Non-blocking: local session retains full state
        } finally {
          setIsSyncingItems(false);
        }
      }, 350);
    },
    [broadcastEvent, currentUser]
  );

  const pushRecentScan = useCallback((ok: boolean, label: string, detail: string) => {
    const timeStr = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setRecentScans((prev) => [
      { id: `${Date.now()}-${Math.random()}`, time: timeStr, ok, label, detail },
      ...prev.slice(0, 7),
    ]);
  }, []);

  const checkCategoryMismatchWarning = useCallback(
    (item: PutawayTaskItem, targetLoc: string) => {
      const rec = (item.recommended_lokasi || '').trim().toUpperCase();
      const target = targetLoc.trim().toUpperCase();
      if (!rec || rec === target) return;

      const recPrefix = rec.match(/^([ABCDE])/i)?.[1]?.toUpperCase();
      const targetPrefix = target.match(/^([ABCDE])/i)?.[1]?.toUpperCase();
      const recArea = getAreaFromLokasi(rec);
      const targetArea = getAreaFromLokasi(target);

      if (recArea !== targetArea || (recPrefix && targetPrefix && recPrefix !== targetPrefix)) {
        onNotify?.(
          `⚠️ Penempatan ke ${target} (${targetArea}) berbeda dari rekomendasi ${rec} (${item.target_zone_label}). Tetap dicatat sesuai kondisi lapangan.`,
          'warning'
        );
      }
    },
    [onNotify]
  );

  const placeQtyOnItem = useCallback(
    (itemId: string, rawTargetLoc: string, deltaQty: number) => {
      const cleanLoc = normalizeLokasi(rawTargetLoc.trim().toUpperCase()) || rawTargetLoc.trim().toUpperCase();
      const targetArea = getAreaFromLokasi(cleanLoc);

      if (!cleanLoc || targetArea === 'Anomali') {
        playErrorBeep();
        vibrateDevice([90, 40, 90]);
        onNotify?.(`Kode rak "${rawTargetLoc}" tidak valid (Anomali).`, 'error');
        return false;
      }
      if (sourceLocationSet.has(cleanLoc)) {
        playErrorBeep();
        vibrateDevice([90, 40, 90]);
        onNotify?.(`Rak tujuan ${cleanLoc} tidak boleh sama dengan lokasi asal putaway!`, 'error');
        return false;
      }

      const nowIso = new Date().toISOString();
      const currentTask = taskStateRef.current;
      let didUpdate = false;
      let updatedItemRef: PutawayTaskItem | null = null;
      let errorMsg = '';

      const nextItems = (currentTask.items || []).map((it) => {
        if (it.id !== itemId) return it;
        const remaining = Math.max(0, (Number(it.qty_target) || 0) - (Number(it.qty_placed) || 0));

        if (deltaQty > 0 && remaining <= 0) {
          errorMsg = `${it.sku} sudah selesai (${it.qty_placed}/${it.qty_target} pcs).`;
          return it;
        }

        const effectiveDelta = deltaQty > 0 ? Math.min(deltaQty, remaining) : deltaQty;
        if (effectiveDelta === 0) return it;

        const nextPlacements: PutawayPlacement[] = (it.placements || []).map((p) => ({ ...p }));
        const idx = nextPlacements.findIndex((p) => p.lokasi.toUpperCase() === cleanLoc);
        if (idx >= 0) {
          const newPQty = nextPlacements[idx].qty + effectiveDelta;
          if (newPQty <= 0) {
            nextPlacements.splice(idx, 1);
          } else {
            nextPlacements[idx] = {
              ...nextPlacements[idx],
              qty: newPQty,
              placed_by: currentUser,
              placed_at: nowIso,
              is_overridden: Boolean(it.recommended_lokasi && cleanLoc !== it.recommended_lokasi),
            };
          }
        } else if (effectiveDelta > 0) {
          nextPlacements.push({
            lokasi: cleanLoc,
            area: targetArea,
            qty: effectiveDelta,
            placed_by: currentUser,
            placed_at: nowIso,
            is_overridden: Boolean(it.recommended_lokasi && cleanLoc !== it.recommended_lokasi),
          });
        } else {
          return it;
        }

        const nextPlaced = nextPlacements.reduce((s, p) => s + (Number(p.qty) || 0), 0);
        const nextStatus: PutawayTaskItem['status'] =
          nextPlaced >= it.qty_target
            ? 'SELESAI'
            : nextPlaced > 0
            ? 'PROSES'
            : it.status === 'KENDALA'
            ? 'KENDALA'
            : 'PENDING';

        const updated: PutawayTaskItem = {
          ...it,
          placements: nextPlacements,
          qty_placed: nextPlaced,
          status: nextStatus,
          last_actor: currentUser,
          updated_at: nowIso,
        };
        didUpdate = true;
        updatedItemRef = updated;
        pendingLocalItemSyncRef.current.set(it.id, Date.now());
        return updated;
      });

      if (errorMsg) {
        playErrorBeep();
        onNotify?.(errorMsg, 'warning');
        return false;
      }

      if (didUpdate && updatedItemRef) {
        const nextTask: PutawayTask = {
          ...currentTask,
          items: nextItems,
          updated_at: nowIso,
        };
        taskStateRef.current = nextTask;
        setTaskState(nextTask);
        scheduleSyncToCloud(nextItems);

        if (deltaQty > 0) {
          checkCategoryMismatchWarning(updatedItemRef, cleanLoc);
        }
        playSuccessBeep();
        vibrateDevice(40);
        return true;
      }
      return false;
    },
    [checkCategoryMismatchWarning, currentUser, onNotify, scheduleSyncToCloud, sourceLocationSet]
  );

  const handleHybridScan = useCallback(
    (rawInput: string) => {
      const trimmed = String(rawInput || '').trim().toUpperCase();
      if (!trimmed) return;

      // 1. Explicit #LOK / LOK prefix detection
      const lokMatch = trimmed.match(/^#?LOK[\s:-]*(.+)$/i);
      let isLocationCode = Boolean(lokMatch);
      let candidateLoc = lokMatch ? lokMatch[1].trim().toUpperCase() : trimmed;

      // 2. Implicit rack detection (if not a known SKU and maps to valid non-Anomali area)
      if (!isLocationCode && !taskSkuSet.has(trimmed) && !catalogSkuSet.has(trimmed)) {
        const normCheck = normalizeLokasi(trimmed);
        if (getAreaFromLokasi(normCheck) !== 'Anomali') {
          isLocationCode = true;
          candidateLoc = normCheck;
        }
      }

      if (isLocationCode) {
        const normLoc = normalizeLokasi(candidateLoc) || candidateLoc;
        const area = getAreaFromLokasi(normLoc);
        if (!normLoc || area === 'Anomali') {
          playErrorBeep();
          vibrateDevice([90, 40, 90]);
          pushRecentScan(false, trimmed, 'Lokasi Anomali ditolak');
          onNotify?.(`Kode lokasi "${candidateLoc}" tidak valid (Anomali).`, 'error');
          return;
        }
        if (sourceLocationSet.has(normLoc)) {
          playErrorBeep();
          vibrateDevice([90, 40, 90]);
          pushRecentScan(false, normLoc, 'Lokasi asal tidak boleh jadi tujuan');
          onNotify?.(`Rak ${normLoc} adalah lokasi asal putaway!`, 'error');
          return;
        }

        // Mode 2 completion: SKU was scanned first -> now confirm placement into scanned rack!
        if (guidedItemId) {
          const guidedItem = taskStateRef.current.items.find((it) => it.id === guidedItemId);
          if (guidedItem && guidedItem.qty_placed < guidedItem.qty_target) {
            const ok = placeQtyOnItem(guidedItem.id, normLoc, 1);
            if (ok) {
              setActiveTargetLoc(normLoc);
              setGuidedItemId(null);
              pushRecentScan(true, `${guidedItem.sku} -> ${normLoc}`, '+1 pcs ditempatkan');
              onNotify?.(
                `✅ +1 ${guidedItem.sku} ditempatkan di rak ${normLoc}!`,
                'success'
              );
            }
            return;
          }
          setGuidedItemId(null);
        }

        // Mode 1: Lock active target rack
        setActiveTargetLoc(normLoc);
        playCategoryBeep();
        const matchingCount = (taskStateRef.current.items || []).filter(
          (it) =>
            it.recommended_lokasi.toUpperCase() === normLoc &&
            it.qty_placed < it.qty_target
        ).length;
        pushRecentScan(true, `RAK ${normLoc}`, `${matchingCount} item rute`);
        onNotify?.(
          matchingCount > 0
            ? `📍 Rak tujuan aktif: ${normLoc} (${matchingCount} baris SKU diarahkan ke sini). Silakan scan SKU!`
            : `📍 Rak tujuan aktif: ${normLoc}. Scan SKU apa saja untuk menaruhnya di rak ini.`,
          'info'
        );
        return;
      }

      // 3. SKU Scan
      const items = taskStateRef.current.items || [];
      const matchingPending = items.filter(
        (it) => it.sku.toUpperCase() === trimmed && it.qty_placed < it.qty_target
      );

      if (matchingPending.length === 0) {
        const alreadyDone = items.some((it) => it.sku.toUpperCase() === trimmed);
        playErrorBeep();
        vibrateDevice([90, 40, 90]);
        if (alreadyDone) {
          pushRecentScan(false, trimmed, 'Target sudah penuh');
          onNotify?.(`SKU ${trimmed} sudah ditempatkan 100% sesuai target.`, 'info');
        } else {
          pushRecentScan(false, trimmed, 'Tidak ada di tugas ini');
          onNotify?.(`SKU ${trimmed} tidak termasuk dalam daftar Tugas Putaway ini.`, 'error');
        }
        return;
      }

      // If Mode 1 activeTargetLoc is locked -> place directly!
      if (activeTargetLoc) {
        const preferred =
          matchingPending.find(
            (it) => it.recommended_lokasi.toUpperCase() === activeTargetLoc.toUpperCase()
          ) || matchingPending[0];
        const ok = placeQtyOnItem(preferred.id, activeTargetLoc, 1);
        if (ok) {
          pushRecentScan(
            true,
            `${preferred.sku} @ ${activeTargetLoc}`,
            `${preferred.qty_placed + 1}/${preferred.qty_target} pcs`
          );
        }
        return;
      }

      // Mode 2 Guided Putaway: highlight recommended rack and wait for #LOK scan or 1-tap confirm
      const targetItem = matchingPending[0];
      setGuidedItemId(targetItem.id);
      playCategoryBeep();
      vibrateDevice(30);
      pushRecentScan(
        true,
        `GUIDE ${targetItem.sku}`,
        `Taruh di ${targetItem.recommended_lokasi || 'PILIH MANUAL'}`
      );
      onNotify?.(
        `👉 Taruh ${targetItem.nama_produk} (${targetItem.size}) di rak ${targetItem.recommended_lokasi || 'PILIH MANUAL'}, lalu scan #LOK rak tujuan!`,
        'info'
      );
    },
    [
      activeTargetLoc,
      catalogSkuSet,
      guidedItemId,
      onNotify,
      placeQtyOnItem,
      pushRecentScan,
      sourceLocationSet,
      taskSkuSet,
    ]
  );

  // Derived totals & sorted/grouped view
  const stats = useMemo(() => {
    const items = taskState.items || [];
    const totalTarget = items.reduce((s, it) => s + (Number(it.qty_target) || 0), 0);
    const totalPlaced = items.reduce((s, it) => s + (Number(it.qty_placed) || 0), 0);
    const completedRows = items.filter((it) => it.qty_placed >= it.qty_target).length;
    const progressPct = totalTarget > 0 ? Math.min(100, Math.round((totalPlaced / totalTarget) * 100)) : 0;
    const overriddenCount = items.filter((it) =>
      (it.placements || []).some((p) => p.is_overridden)
    ).length;
    return {
      totalRows: items.length,
      completedRows,
      totalTarget,
      totalPlaced,
      remainingPcs: Math.max(0, totalTarget - totalPlaced),
      progressPct,
      overriddenCount,
    };
  }, [taskState.items]);

  const guidedItem = useMemo(
    () => (guidedItemId ? taskState.items.find((it) => it.id === guidedItemId) || null : null),
    [guidedItemId, taskState.items]
  );

  const visibleGroupedItems = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    const groups = new Map<string, PutawayTaskItem[]>();

    for (const it of taskState.items || []) {
      if (hideCompleted && it.qty_placed >= it.qty_target) continue;
      if (q) {
        const hay = `${it.sku} ${it.nama_produk} ${it.recommended_lokasi} ${it.source_lokasi} ${it.size}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const key = (it.recommended_lokasi || '').trim().toUpperCase() || 'PILIH MANUAL';
      const arr = groups.get(key) || [];
      arr.push(it);
      groups.set(key, arr);
    }

    const entries = Array.from(groups.entries());
    // Float activeTargetLoc group to top when locked
    if (activeTargetLoc) {
      entries.sort((a, b) => {
        const aAct = a[0] === activeTargetLoc.toUpperCase() ? 0 : 1;
        const bAct = b[0] === activeTargetLoc.toUpperCase() ? 0 : 1;
        return aAct - bAct;
      });
    }
    return entries;
  }, [activeTargetLoc, hideCompleted, searchFilter, taskState.items]);

  // Open Edit / Override / Split Rack Modal
  const openEditItemRack = (item: PutawayTaskItem) => {
    setEditingItem(item);
    setOverrideLocInput(item.recommended_lokasi || item.alternative_lokasis?.[0] || '');
    const rem = Math.max(1, item.qty_target - item.qty_placed);
    setOverrideSplitQty(rem);
    setItemNoteInput(item.note || '');
  };

  const handleApplyPrimaryRackOverride = () => {
    if (!editingItem) return;
    const raw = overrideLocInput.trim().toUpperCase();
    const normLoc = normalizeLokasi(raw) || raw;
    const area = getAreaFromLokasi(normLoc);
    if (!normLoc || area === 'Anomali') {
      onNotify?.(`Kode rak "${overrideLocInput}" tidak valid (Anomali).`, 'error');
      return;
    }
    if (sourceLocationSet.has(normLoc)) {
      onNotify?.(`Rak tujuan tidak boleh sama dengan lokasi asal (${normLoc}).`, 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const noteTrim = itemNoteInput.trim();
    setTaskState((prev) => {
      const nextItems = (prev.items || []).map((it) => {
        if (it.id !== editingItem.id) return it;
        pendingLocalItemSyncRef.current.set(it.id, Date.now());
        return {
          ...it,
          recommended_lokasi: normLoc,
          recommended_reason: `Diubah manual oleh ${formatOperatorWithPersonName(currentUser)}`,
          note: noteTrim || it.note,
          updated_at: nowIso,
        };
      });
      scheduleSyncToCloud(nextItems);
      return { ...prev, items: nextItems, updated_at: nowIso };
    });
    checkCategoryMismatchWarning(editingItem, normLoc);
    onNotify?.(`Rak tujuan untuk ${editingItem.sku} diubah ke ${normLoc}.`, 'success');
    setEditingItem(null);
  };

  const handleApplySplitPlacement = () => {
    if (!editingItem) return;
    const ok = placeQtyOnItem(editingItem.id, overrideLocInput, overrideSplitQty);
    if (ok) {
      if (itemNoteInput.trim() && itemNoteInput.trim() !== (editingItem.note || '')) {
        const nowIso = new Date().toISOString();
        setTaskState((prev) => {
          const nextItems = (prev.items || []).map((it) =>
            it.id === editingItem.id ? { ...it, note: itemNoteInput.trim(), updated_at: nowIso } : it
          );
          scheduleSyncToCloud(nextItems);
          return { ...prev, items: nextItems };
        });
      }
      setEditingItem(null);
    }
  };

  const handleMarkItemKendala = (item: PutawayTaskItem, noteText: string) => {
    const nowIso = new Date().toISOString();
    setTaskState((prev) => {
      const nextItems = (prev.items || []).map((it) => {
        if (it.id !== item.id) return it;
        pendingLocalItemSyncRef.current.set(it.id, Date.now());
        return {
          ...it,
          status: 'KENDALA' as const,
          note: noteText.trim() || 'Stok fisik kurang / kendala lapangan',
          last_actor: currentUser,
          updated_at: nowIso,
        };
      });
      scheduleSyncToCloud(nextItems);
      return { ...prev, items: nextItems, updated_at: nowIso };
    });
    onNotify?.(`Catatan kendala disimpan untuk ${item.sku}.`, 'info');
    setEditingItem(null);
  };

  // Open Rekap & Validate live source stock
  const handleOpenRekapModal = async () => {
    setIsRekapOpen(true);
    setStockWarnings([]);
    if (stats.totalPlaced <= 0) return;
    setIsValidatingStock(true);
    try {
      const warnings = await validateSourceStockBeforeSubmit(taskState);
      setStockWarnings(warnings);
    } catch {
      // Offline: validation skipped cleanly
    } finally {
      setIsValidatingStock(false);
    }
  };

  const handleAutoAdjustToLiveStock = () => {
    if (stockWarnings.length === 0) return;
    const nowIso = new Date().toISOString();
    const limitByKey = new Map<string, number>();
    stockWarnings.forEach((w) => {
      limitByKey.set(`${w.source_lokasi}__${w.sku}`, w.liveStockQty);
    });

    const usedByKey = new Map<string, number>();
    setTaskState((prev) => {
      const nextItems = (prev.items || []).map((it) => {
        const key = `${it.source_lokasi.toUpperCase()}__${it.sku.toUpperCase()}`;
        const maxLive = limitByKey.get(key);
        if (maxLive === undefined) return it;

        const alreadyUsed = usedByKey.get(key) || 0;
        const allowedForThisRow = Math.max(0, maxLive - alreadyUsed);
        usedByKey.set(key, alreadyUsed + Math.min(it.qty_placed, allowedForThisRow));

        if (it.qty_placed <= allowedForThisRow) return it;

        let remAllowed = allowedForThisRow;
        const trimmedPlacements: PutawayPlacement[] = [];
        for (const p of it.placements || []) {
          if (remAllowed <= 0) break;
          const keep = Math.min(p.qty, remAllowed);
          if (keep > 0) {
            trimmedPlacements.push({ ...p, qty: keep });
            remAllowed -= keep;
          }
        }
        const nextPlaced = trimmedPlacements.reduce((s, p) => s + p.qty, 0);
        return {
          ...it,
          placements: trimmedPlacements,
          qty_placed: nextPlaced,
          status:
            nextPlaced >= it.qty_target
              ? ('SELESAI' as const)
              : nextPlaced > 0
              ? ('PROSES' as const)
              : ('KENDALA' as const),
          note: it.note || `Disesuaikan ke stok live sumber (${maxLive} pcs)`,
          updated_at: nowIso,
        };
      });
      return { ...prev, items: nextItems, updated_at: nowIso };
    });
    setStockWarnings([]);
    onNotify?.('Kuantitas penempatan disesuaikan dengan stok live di rak asal.', 'success');
  };

  const handleConfirmSubmitFinal = async () => {
    if (stats.totalPlaced <= 0) {
      onNotify?.('Belum ada barang yang ditempatkan (> 0 pcs).', 'warning');
      return;
    }
    setIsSubmittingFinal(true);
    try {
      const res = await completePutawayTask({
        task: taskState,
        completedBy: currentUser,
        catatan: rekapCatatan,
      });

      broadcastEvent('task_completed', { invoice: res.task.invoice_putaway });
      playSaveSuccessChime();
      try {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
      } catch {}

      onNotify?.(
        res.queuedOffline
          ? `📦 Putaway ${res.task.invoice_putaway} selesai disimpan ke Antrean Offline (${stats.totalPlaced} pcs). Akan otomatis sinkron saat online.`
          : `✅ Tugas Putaway ${res.task.invoice_putaway} selesai! ${stats.totalPlaced} pcs tercatat OUT asal & IN tujuan.`,
        res.queuedOffline ? 'warning' : 'success'
      );
      setIsRekapOpen(false);
      onTaskCompleted(res.task, res.queuedOffline);
    } catch (err: any) {
      onNotify?.(err?.message || 'Gagal menyelesaikan Tugas Putaway.', 'error');
    } finally {
      setIsSubmittingFinal(false);
    }
  };

  const handleSendWhatsApp = async () => {
    setIsSendingWa(true);
    const msg = formatPutawayWhatsAppMessage(taskState);
    try {
      const cfg = getFonnteConfig();
      if (cfg.token && cfg.groupTarget && cfg.autoSendEnabled) {
        const res = await sendFonnteMessage(normalizeWhatsAppNumber(cfg.groupTarget), msg, cfg.token);
        if (res.success) {
          onNotify?.('✅ Rute Tugas Putaway dikirim ke Grup WA via Fonnte!', 'success');
          return;
        }
      }
      try {
        await navigator.clipboard.writeText(msg);
      } catch {}
      window.open(getWhatsAppWebUrl('', msg), '_blank', 'noopener,noreferrer');
      onNotify?.('Membuka WhatsApp Web (pesan rute juga disalin ke clipboard).', 'info');
    } finally {
      setIsSendingWa(false);
    }
  };

  const otherOperators = useMemo(
    () =>
      (taskState.active_operators || []).filter(
        (op) => !isSameOperatorIdentity(op, currentUser)
      ),
    [currentUser, taskState.active_operators]
  );

  const handleLeaveCoPutaway = async () => {
    setIsCancelling(true);
    try {
      await leavePutawayTask(taskState.id, currentUser, taskState);
      broadcastEvent('operator_left');
      clearActivePutawaySession();
      onNotify?.(`Anda keluar dari Tugas Putaway ${taskState.invoice_putaway}.`, 'info');
      setIsExitModalOpen(false);
      onCloseWorkspace();
    } catch {
      clearActivePutawaySession();
      onCloseWorkspace();
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCancelEntireTask = async () => {
    setIsCancelling(true);
    try {
      await cancelPutawayTask(taskState.id, currentUser, 'Dibatalkan dari workspace');
      broadcastEvent('task_cancelled');
      clearActivePutawaySession();
      onNotify?.(
        `Tugas Putaway ${taskState.invoice_putaway} dibatalkan & reservasi slot dilepas.`,
        'info'
      );
      setIsExitModalOpen(false);
      onTaskCancelled();
    } catch (err: any) {
      onNotify?.(err?.message || 'Gagal membatalkan Tugas Putaway.', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full h-full sm:h-[94vh] sm:max-w-6xl bg-slate-50 dark:bg-[#0B1220] sm:border border-slate-200 dark:border-slate-800 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* TOP WORKSPACE HEADER */}
        <div className="px-3 sm:px-5 py-3 bg-white dark:bg-[#131d31] border-b border-slate-200 dark:border-slate-800 space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-black text-sm sm:text-base text-slate-900 dark:text-white">
                  {taskState.invoice_putaway}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800">
                  Plafon {taskState.safe_cap_percent}%
                </span>
                {!isOnline && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300">
                    <WifiOff className="w-3 h-3" /> Offline
                  </span>
                )}
                {isSyncingItems && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> Sync...
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Sumber:</span>
                {taskState.source_locations.map((loc) => (
                  <span
                    key={loc}
                    className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-800 dark:text-slate-200 text-[10px]"
                  >
                    {loc}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1 ml-1 text-emerald-700 dark:text-emerald-400 font-bold">
                  <Users className="w-3 h-3" />
                  {(taskState.active_operators || [])
                    .map((op) => formatOperatorWithPersonName(op))
                    .join(', ') || formatOperatorWithPersonName(currentUser)}
                </span>
              </div>
            </div>

            {/* Toolbar Buttons (Anti-Pelangi: Max 1 primary solid, rest neutral outline) */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => printPutawayRouteA4(taskState)}
                className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 rounded-xl flex items-center gap-1 cursor-pointer"
                title="Cetak Daftar Rute Putaway A4"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Cetak A4</span>
              </button>
              <button
                type="button"
                onClick={() => printPutawayRouteThermal(taskState, '80mm')}
                className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 rounded-xl flex items-center gap-1 cursor-pointer"
                title="Cetak Struk Thermal 80mm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Struk</span>
              </button>
              <button
                type="button"
                disabled={isSendingWa}
                onClick={handleSendWhatsApp}
                className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 rounded-xl flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="Kirim Rute ke Grup WhatsApp"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden md:inline">WA</span>
              </button>
              <button
                type="button"
                onClick={onMinimize}
                className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 rounded-xl flex items-center gap-1 cursor-pointer"
                title="Minimize ke Dock Mengambang"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Minimize</span>
              </button>
              <button
                type="button"
                onClick={() => setIsExitModalOpen(true)}
                className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl flex items-center gap-1 cursor-pointer"
                title="Keluar atau Batalkan Tugas"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
              <button
                type="button"
                onClick={handleOpenRekapModal}
                className="px-3.5 py-1.5 text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Selesai ({stats.totalPlaced}/{stats.totalTarget})</span>
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full origin-left transition-transform duration-200 ${
                  stats.progressPct >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                }`}
                style={{ transform: `scaleX(${Math.min(1, stats.progressPct / 100)})` }}
              />
            </div>
            <span className="text-xs font-mono font-black tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
              {stats.totalPlaced}/{stats.totalTarget} pcs ({stats.progressPct}%)
            </span>
          </div>
        </div>

        {/* SCROLLABLE WORKSPACE BODY */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 pb-20 sm:pb-6">
          {/* HYBRID SCANNER BAR */}
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'fisik', label: 'Scanner Fisik', icon: ScanBarcode },
                    { id: 'kamera', label: 'Kamera', icon: Camera },
                    { id: 'manual', label: 'Ketik Manual', icon: Keyboard },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  const active = inputMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setInputMode(m.id)}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors ${
                        active
                          ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active Target Rack Pill */}
              <div className="flex items-center gap-1.5">
                {activeTargetLoc ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700 text-xs font-mono font-black">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>Rak Aktif: {activeTargetLoc}</span>
                    <button
                      type="button"
                      onClick={() => setActiveTargetLoc('')}
                      className="ml-1 hover:text-rose-600 cursor-pointer"
                      title="Lepas kunci rak aktif (kembali ke mode scan SKU dulu)"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Scan <strong>#LOK</strong> dulu atau langsung scan <strong>SKU</strong>
                  </span>
                )}
              </div>
            </div>

            {inputMode === 'kamera' ? (
              <div className="max-w-md mx-auto">
                <CameraScanner
                  id="putaway-camera-reader"
                  onScan={handleHybridScan}
                />
              </div>
            ) : (
              <PhysicalScanInput
                onScan={handleHybridScan}
                products={productCatalog}
                placeholder={
                  guidedItem
                    ? `Scan #LOK rak tujuan (disarankan ${guidedItem.recommended_lokasi || 'bebas'})...`
                    : activeTargetLoc
                    ? `Rak aktif ${activeTargetLoc} — Scan SKU barang atau scan #LOK rak lain...`
                    : 'Scan #LOK rak tujuan (contoh: #LOK A001) atau langsung scan SKU barang...'
                }
              />
            )}

            {/* MODE 2 GUIDED PUTAWAY SPOTLIGHT */}
            {guidedItem && (
              <div className="p-3 sm:p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border-2 border-indigo-400 dark:border-indigo-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-black uppercase">
                      Mode Panduan Scan SKU
                    </span>
                    <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                      {guidedItem.sku}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                      {guidedItem.nama_produk} ({guidedItem.size})
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      Ambil dari <strong className="font-mono">{guidedItem.source_lokasi}</strong> → Taruh di:
                    </span>
                    <span className="px-3 py-0.5 rounded-lg bg-slate-900 dark:bg-amber-500 text-white dark:text-black font-mono font-black text-base">
                      {guidedItem.recommended_lokasi || 'PILIH MANUAL'}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      ({guidedItem.recommended_reason})
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {guidedItem.recommended_lokasi && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const ok = placeQtyOnItem(guidedItem.id, guidedItem.recommended_lokasi, 1);
                          if (ok) {
                            setActiveTargetLoc(guidedItem.recommended_lokasi);
                            setGuidedItemId(null);
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl cursor-pointer"
                      >
                        Konfirmasi +1 ({guidedItem.recommended_lokasi})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const rem = Math.max(1, guidedItem.qty_target - guidedItem.qty_placed);
                          const ok = placeQtyOnItem(guidedItem.id, guidedItem.recommended_lokasi, rem);
                          if (ok) {
                            setActiveTargetLoc(guidedItem.recommended_lokasi);
                            setGuidedItemId(null);
                          }
                        }}
                        className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl cursor-pointer"
                      >
                        Taruh Semua
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditItemRack(guidedItem)}
                    className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl cursor-pointer"
                  >
                    Ubah Rak
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuidedItemId(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    title="Tutup panduan"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Recent Scan Strip */}
            {recentScans.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {recentScans.map((r) => (
                  <span
                    key={r.id}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-mono shrink-0 ${
                      r.ok
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                        : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    <span className="font-bold">{r.label}</span>
                    <span className="opacity-80">{r.detail}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ROUTE SEARCH & FILTER BAR */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Cari SKU, Nama Produk, Rak Tujuan, atau Rak Sumber..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white"
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <label className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0 select-none">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600"
              />
              <span>Sembunyikan yang Selesai ({stats.completedRows}/{stats.totalRows})</span>
            </label>
          </div>

          {/* GROUPED ROUTE LIST */}
          {visibleGroupedItems.length === 0 ? (
            <div className="py-12 text-center bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-500">
              {stats.completedRows === stats.totalRows && stats.totalRows > 0
                ? 'Seluruh item putaway sudah ditempatkan! Tekan tombol "Selesai" di kanan atas untuk menyimpan mutasi.'
                : 'Tidak ada baris tugas yang sesuai filter.'}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleGroupedItems.map(([destLoc, groupItems]) => {
                const isGroupLocked = activeTargetLoc.toUpperCase() === destLoc;
                const grpTarget = groupItems.reduce((s, it) => s + it.qty_target, 0);
                const grpPlaced = groupItems.reduce((s, it) => s + it.qty_placed, 0);
                const isGrpDone = grpPlaced >= grpTarget;

                return (
                  <div
                    key={destLoc}
                    className={`rounded-2xl border overflow-hidden transition-colors ${
                      isGroupLocked
                        ? 'border-emerald-400 dark:border-emerald-700 ring-1 ring-emerald-500/30 bg-white dark:bg-[#131d31]'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131d31]'
                    }`}
                  >
                    {/* Destination Rack Header */}
                    <div
                      className={`px-3.5 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 ${
                        isGroupLocked
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
                          : isGrpDone
                          ? 'bg-slate-50/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                          : 'bg-slate-50 dark:bg-[#0E1420] border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-lg font-mono font-black text-xs sm:text-sm ${
                            destLoc === 'PILIH MANUAL'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300'
                              : isGroupLocked
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black'
                          }`}
                        >
                          {destLoc}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                          {grpPlaced}/{grpTarget} pcs ({groupItems.length} baris)
                        </span>
                        {isGroupLocked && (
                          <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300">
                            ● Rak Aktif Terkunci
                          </span>
                        )}
                      </div>

                      {destLoc !== 'PILIH MANUAL' && !isGroupLocked && (
                        <button
                          type="button"
                          onClick={() => setActiveTargetLoc(destLoc)}
                          className="px-2.5 py-1 text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <Navigation className="w-3 h-3 text-indigo-600" />
                          <span>Aktifkan Rak Ini</span>
                        </button>
                      )}
                    </div>

                    {/* Items inside this destination group — Desktop 1-Row Table */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full table-fixed border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1420]/70 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <th className="py-2 pl-4 pr-2 w-[33%]">Nama Produk</th>
                            <th className="py-2 px-2 w-[9%]">Size</th>
                            <th className="py-2 px-2 w-[23%]">SKU &amp; Asal</th>
                            <th className="py-2 px-2 w-[11%] text-center">Qty</th>
                            <th className="py-2 pl-2 pr-4 w-[24%] text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                          {groupItems.map((item) => {
                            const isDone = item.qty_placed >= item.qty_target;
                            const rem = Math.max(0, item.qty_target - item.qty_placed);
                            const activeActionLoc =
                              activeTargetLoc || item.recommended_lokasi || '';

                            return (
                              <tr
                                key={item.id}
                                className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30 ${
                                  isDone ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''
                                }`}
                              >
                                <td className="py-2.5 pl-4 pr-2 align-middle">
                                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate" title={item.nama_produk}>
                                    {item.nama_produk}
                                  </div>
                                  {(item.recommended_reason || item.note || (item.placements || []).length > 0) && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                      {item.recommended_reason && (
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[260px]" title={item.recommended_reason}>
                                          {item.recommended_reason}
                                        </span>
                                      )}
                                      {item.note && (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                                          <MessageSquare className="w-3 h-3 shrink-0" />
                                          <span>{item.note}</span>
                                        </span>
                                      )}
                                      {(item.placements || []).map((p) => (
                                        <span
                                          key={p.lokasi}
                                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-mono font-bold ${
                                            p.is_overridden
                                              ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700'
                                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                                          }`}
                                        >
                                          <span>
                                            {p.lokasi}: {p.qty}{p.is_overridden ? '*' : ''}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => placeQtyOnItem(item.id, p.lokasi, -1)}
                                            className="hover:text-rose-600 cursor-pointer"
                                            title={`Kurangi 1 pcs dari ${p.lokasi}`}
                                          >
                                            <Minus className="w-2.5 h-2.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => placeQtyOnItem(item.id, p.lokasi, -p.qty)}
                                            className="hover:text-rose-600 cursor-pointer"
                                            title={`Hapus penempatan di ${p.lokasi}`}
                                          >
                                            <Trash2 className="w-2.5 h-2.5" />
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>

                                <td className="py-2.5 px-2 align-middle">
                                  <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[11px] text-slate-700 dark:text-slate-200">
                                    {item.size || '-'}
                                  </span>
                                </td>

                                <td className="py-2.5 px-2 align-middle">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                                      {item.sku}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px] text-slate-600 dark:text-slate-300">
                                      Dari {item.source_lokasi}
                                    </span>
                                    {item.status === 'KENDALA' && (
                                      <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 text-[10px] font-bold">
                                        Kendala
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="py-2.5 px-2 align-middle text-center">
                                  <span
                                    className={`inline-flex px-2.5 py-1 rounded-lg font-mono font-black text-xs tabular-nums whitespace-nowrap ${
                                      isDone
                                        ? 'bg-emerald-600 text-white'
                                        : item.qty_placed > 0
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300'
                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                    }`}
                                  >
                                    {item.qty_placed}/{item.qty_target} pcs
                                  </span>
                                </td>

                                <td className="py-2.5 pl-2 pr-4 align-middle">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {!isDone && activeActionLoc && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => placeQtyOnItem(item.id, activeActionLoc, 1)}
                                          className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 rounded-xl flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                          title={`Taruh +1 pcs ke ${activeActionLoc}`}
                                        >
                                          <Plus className="w-3.5 h-3.5 text-emerald-600" />
                                          <span>1</span>
                                        </button>
                                        {rem > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => placeQtyOnItem(item.id, activeActionLoc, rem)}
                                            className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 rounded-xl flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                            title={`Taruh semua sisa (${rem} pcs) ke ${activeActionLoc}`}
                                          >
                                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>Semua ({rem})</span>
                                          </button>
                                        )}
                                      </>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => openEditItemRack(item)}
                                      className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 rounded-xl flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                      title="Ubah rak tujuan, split ke rak lain, atau catat kendala"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                      <span>Ubah Rak</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Items inside this destination group — Mobile Compact View */}
                    <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
                      {groupItems.map((item) => {
                        const isDone = item.qty_placed >= item.qty_target;
                        const rem = Math.max(0, item.qty_target - item.qty_placed);
                        const activeActionLoc =
                          activeTargetLoc || item.recommended_lokasi || '';

                        return (
                          <div
                            key={item.id}
                            className={`p-3 flex flex-col justify-between gap-2.5 ${
                              isDone ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''
                            }`}
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                                  {item.sku}
                                </span>
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px] text-slate-700 dark:text-slate-300">
                                  Dari {item.source_lokasi}
                                </span>
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px] text-slate-700 dark:text-slate-300">
                                  Size {item.size}
                                </span>
                                {item.status === 'KENDALA' && (
                                  <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 text-[10px] font-bold">
                                    Kendala
                                  </span>
                                )}
                              </div>

                              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                                {item.nama_produk}
                              </div>

                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {item.recommended_reason}
                              </div>

                              {/* Actual Placements Chips (shows split racks & overrides clearly) */}
                              {(item.placements || []).length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                  {item.placements.map((p) => (
                                    <span
                                      key={p.lokasi}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-mono font-bold ${
                                        p.is_overridden
                                          ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700'
                                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                                      }`}
                                    >
                                      <span>
                                        {p.lokasi}: {p.qty} pcs{p.is_overridden ? ' (Diubah)' : ''}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => placeQtyOnItem(item.id, p.lokasi, -1)}
                                        className="ml-0.5 p-0.5 hover:text-rose-600 cursor-pointer"
                                        title={`Kurangi 1 pcs dari ${p.lokasi}`}
                                      >
                                        <Minus className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => placeQtyOnItem(item.id, p.lokasi, -p.qty)}
                                        className="p-0.5 hover:text-rose-600 cursor-pointer"
                                        title={`Hapus penempatan di ${p.lokasi}`}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {item.note && (
                                <div className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 pt-0.5">
                                  <MessageSquare className="w-3 h-3 shrink-0" />
                                  <span>{item.note}</span>
                                </div>
                              )}
                            </div>

                            {/* Right Actions */}
                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <span
                                className={`px-2.5 py-1 rounded-lg font-mono font-black text-xs tabular-nums ${
                                  isDone
                                    ? 'bg-emerald-600 text-white'
                                    : item.qty_placed > 0
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {item.qty_placed}/{item.qty_target} pcs
                              </span>

                              {!isDone && activeActionLoc && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => placeQtyOnItem(item.id, activeActionLoc, 1)}
                                    className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 rounded-xl flex items-center gap-1 cursor-pointer"
                                    title={`Taruh +1 pcs ke ${activeActionLoc}`}
                                  >
                                    <Plus className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>1</span>
                                  </button>
                                  {rem > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => placeQtyOnItem(item.id, activeActionLoc, rem)}
                                      className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 rounded-xl flex items-center gap-1 cursor-pointer"
                                      title={`Taruh semua sisa (${rem} pcs) ke ${activeActionLoc}`}
                                    >
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Semua ({rem})</span>
                                    </button>
                                  )}
                                </>
                              )}

                              <button
                                type="button"
                                onClick={() => openEditItemRack(item)}
                                className="px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 rounded-xl flex items-center gap-1 cursor-pointer"
                                title="Ubah rak tujuan, split ke rak lain, atau catat kendala"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span>Ubah Rak</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MODAL 1: UBAH / SPLIT RAK TUJUAN */}
        {editingItem && (
          <div
            onClick={() => setEditingItem(null)}
            className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[90vh] bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
                <div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Ubah / Split Rak Tujuan
                  </div>
                  <div className="text-xs font-mono text-slate-500">
                    {editingItem.sku} · {editingItem.nama_produk} ({editingItem.size})
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {editingItem.alternative_lokasis && editingItem.alternative_lokasis.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-500 uppercase">
                      Rekomendasi Rak Alternatif Terdekat
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {editingItem.alternative_lokasis.map((altLoc) => {
                        const slotInfo = slotByLokasi.get(altLoc.toUpperCase());
                        return (
                          <button
                            key={altLoc}
                            type="button"
                            onClick={() => setOverrideLocInput(altLoc)}
                            className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-colors ${
                              overrideLocInput.toUpperCase() === altLoc.toUpperCase()
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-indigo-400'
                            }`}
                          >
                            <span>{altLoc}</span>
                            {slotInfo && (
                              <span className="ml-1.5 text-[10px] opacity-80">
                                ({slotInfo.fillPercent}%)
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Kode Rak Tujuan Aktual
                    </label>
                    <input
                      type="text"
                      value={overrideLocInput}
                      onChange={(e) => setOverrideLocInput(e.target.value.toUpperCase())}
                      placeholder="Contoh: A002 / B005 / R010"
                      className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                    {overrideLocInput.trim() && (
                      <div className="mt-1 text-[10px]">
                        {(() => {
                          const norm = normalizeLokasi(overrideLocInput.trim().toUpperCase());
                          const area = getAreaFromLokasi(norm);
                          const slot = slotByLokasi.get(norm);
                          if (area === 'Anomali') {
                            return <span className="text-rose-600 font-bold">Kode rak tidak valid (Anomali)</span>;
                          }
                          if (sourceLocationSet.has(norm)) {
                            return <span className="text-rose-600 font-bold">Tidak boleh sama dengan rak asal</span>;
                          }
                          return (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              Area: {area}
                              {slot ? ` · Terisi ${slot.currentQty}/${slot.maxCapacity} pcs (${slot.fillPercent}%)` : ''}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Qty Ditaruh di Rak Ini (Sisa: {Math.max(0, editingItem.qty_target - editingItem.qty_placed)} pcs)
                    </label>
                    <NumberInput
                      min={1}
                      max={Math.max(1, editingItem.qty_target - editingItem.qty_placed)}
                      value={overrideSplitQty}
                      selectOnFocus
                      onValueChange={(val) =>
                        setOverrideSplitQty(
                          Math.max(
                            1,
                            Math.min(
                              Math.max(1, editingItem.qty_target - editingItem.qty_placed),
                              Math.floor(val)
                            )
                          )
                        )
                      }
                      className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Catatan Lapangan / Kendala (Opsional)
                  </label>
                  <input
                    type="text"
                    value={itemNoteInput}
                    onChange={(e) => setItemNoteInput(e.target.value)}
                    placeholder="Contoh: Rak A001 penuh, dipindah ke A002 / fisik kurang 1 pcs..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1420] flex flex-wrap items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleMarkItemKendala(editingItem, itemNoteInput)}
                  className="px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-xl cursor-pointer"
                >
                  Tandai Kendala
                </button>
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleApplyPrimaryRackOverride}
                    className="px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl cursor-pointer"
                  >
                    Ubah Rak Rekomendasi
                  </button>
                  {editingItem.qty_placed < editingItem.qty_target && (
                    <button
                      type="button"
                      onClick={handleApplySplitPlacement}
                      className="px-3.5 py-2 text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl cursor-pointer"
                    >
                      Taruh {overrideSplitQty} pcs ke {overrideLocInput || '...'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: REKAP & KONFIRMASI SUBMIT */}
        {isRekapOpen && (
          <div
            onClick={() => !isSubmittingFinal && setIsRekapOpen(false)}
            className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[90vh] bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="text-base font-extrabold text-slate-900 dark:text-white">
                  Rekap &amp; Simpan Mutasi Putaway
                </div>
                <button
                  type="button"
                  disabled={isSubmittingFinal}
                  onClick={() => setIsRekapOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">Ditempatkan</div>
                    <div className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {stats.totalPlaced} pcs
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">Sisa di Asal</div>
                    <div className="text-base font-black font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                      {stats.remainingPcs} pcs
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">Rak Diubah</div>
                    <div className="text-base font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                      {stats.overriddenCount} baris
                    </div>
                  </div>
                </div>

                {stats.remainingPcs > 0 && (
                  <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-[11px]">
                    Sisa <strong>{stats.remainingPcs} pcs</strong> yang belum ditempatkan akan tetap berada di lokasi asal ({taskState.source_locations.join(', ')}) tanpa penyesuaian otomatis.
                  </div>
                )}

                {isValidatingStock && (
                  <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Memverifikasi ketersediaan stok live di lokasi asal...</span>
                  </div>
                )}

                {stockWarnings.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 space-y-2">
                    <div className="flex items-center gap-1.5 font-extrabold text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Stok Live di Lokasi Asal Berkurang!</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-amber-900 dark:text-amber-200">
                      {stockWarnings.map((w) => (
                        <div key={`${w.source_lokasi}_${w.sku}`} className="font-mono">
                          • {w.source_lokasi} / {w.sku}: Ditaruh {w.placedQty} pcs, Stok Live {w.liveStockQty} pcs
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoAdjustToLiveStock}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-extrabold text-[11px] cursor-pointer"
                    >
                      Sesuaikan Otomatis ke Stok Live
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Catatan Penyelesaian (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={rekapCatatan}
                    onChange={(e) => setRekapCatatan(e.target.value)}
                    placeholder="Contoh: Semua barang X001 sudah masuk rak A–E..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0E1420] flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isSubmittingFinal}
                  onClick={() => setIsRekapOpen(false)}
                  className="px-3.5 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl cursor-pointer"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  disabled={isSubmittingFinal || stats.totalPlaced <= 0}
                  onClick={handleConfirmSubmitFinal}
                  className="px-4 py-2 text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  {isSubmittingFinal && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Konfirmasi &amp; Simpan Mutasi ({stats.totalPlaced} pcs)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: KELUAR / BATALKAN TUGAS */}
        {isExitModalOpen && (
          <div
            onClick={() => !isCancelling && setIsExitModalOpen(false)}
            className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <div className="text-base font-extrabold text-slate-900 dark:text-white">
                  Keluar dari Tugas Putaway?
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {otherOperators.length > 0
                    ? `Ada ${otherOperators.length} rekan lain yang masih mengerjakan tugas ini (${otherOperators.map((o) => formatOperatorWithPersonName(o)).join(', ')}).`
                    : 'Tugas ini masih berstatus AKTIF dan menahan reservasi slot rak tujuan.'}
                </p>
              </div>

              <div className="p-4 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsExitModalOpen(false);
                    onMinimize();
                  }}
                  className="w-full px-4 py-2.5 text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 rounded-xl text-left flex items-center justify-between cursor-pointer"
                >
                  <span>Minimize ke Dock (Lanjutkan Nanti)</span>
                  <Minimize2 className="w-4 h-4 text-indigo-600" />
                </button>

                {otherOperators.length > 0 && (
                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={handleLeaveCoPutaway}
                    className="w-full px-4 py-2.5 text-xs font-bold bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-50 rounded-xl text-left flex items-center justify-between cursor-pointer"
                  >
                    <span>Keluar / Batal Bantu (Tugas Tetap Aktif)</span>
                    <LogOut className="w-4 h-4" />
                  </button>
                )}

                {(otherOperators.length === 0 || isAdmin) && (
                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={handleCancelEntireTask}
                    className="w-full px-4 py-2.5 text-xs font-extrabold bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-left flex items-center justify-between cursor-pointer"
                  >
                    <span>Batalkan Tugas &amp; Lepas Reservasi Slot</span>
                    {isCancelling ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>

              <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => setIsExitModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
