import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Map as MapIcon,
  Plus,
  Trash2,
  RotateCw,
  Copy,
  Lock,
  Unlock,
  ZoomIn,
  ZoomOut,
  Flame,
  Eye,
  EyeOff,
  Search,
  Layers,
  Tag,
  MapPin,
  Sparkles,
  Grid,
  Printer,
  ListChecks,
  Sliders,
  X,
  AlertCircle,
} from 'lucide-react';

export interface WarehouseFloorSpec {
  L: number;
  W: number;
  H: number;
  fc?: string;
  ox?: number;
  oz?: number;
  ft?: string;
  fs?: number;
  lk?: number | boolean;
}

export interface WarehouseObjItem {
  id: number;
  type: string;
  floor: number;
  x: number;
  z: number;
  rot: number;
  y?: number;
  n: string;
  w: number;
  d: number;
  h: number;
  c: string;
  lv?: number;
  gid?: number;
  lk?: number | boolean;
  kl?: boolean;
  kw?: number;
  kd?: number;
  kh?: number;
  nx?: number;
  nz?: number;
  ny?: number;
  tg?: string;
  tc?: string;
  ds?: string;
  wmsCode?: string;
  mir?: boolean;
  dr?: number | boolean;
  s2?: number;
  hl?: number;
}

export interface Warehouse3DLayoutState {
  floors: WarehouseFloorSpec[];
  objs: WarehouseObjItem[];
  cur?: number;
  sel?: number | null;
  uid?: number;
  all?: boolean;
  walls?: boolean;
  cl?: boolean;
  snap?: number;
  ms?: number[];
  gid?: number;
  v2?: number;
  th?: string;
  mg?: boolean;
}

export interface RackSlotSummary {
  lokasi: string;
  area: string;
  currentQty: number;
  maxCapacity: number;
  fillPercent: number;
  skuCount: number;
  status: string;
}

interface Warehouse2DFloorplanEditorProps {
  layout: Warehouse3DLayoutState;
  rackSlotsMap: Record<string, RackSlotSummary>;
  heatmapActive: boolean;
  onToggleHeatmap: () => void;
  onChangeLayout: (nextLayout: Warehouse3DLayoutState) => void;
  onOpenPrintModal?: (lokasi: string) => void;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const FLOOR_LABELS: Record<number, string> = {
  0: 'Lt.1 Studio & Jahit',
  1: 'Lt.2 Rak C & D',
  2: 'Lt.3 Rak A & B',
  3: 'Lt.4 Kolian (R/V/Z)',
};

const AREA_PRESETS = [
  'Section A - DRESS',
  'Section B - BOTTOM',
  'Section C - TOP',
  'Section D - SALE',
  'Area Kolian R/V/Z',
  'Area Live / Studio',
  'Shopee & TikTok',
  'IGLive',
  'Zona Inbound',
  'Zona QC',
  'Packing Order Online',
  'Area Perbaikan / Defect',
];

const QUICK_COLOR_SWATCHES = [
  '#4f46e5',
  '#3b82f6',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#c9a26b',
  '#64748b',
];

const STORAGE_TYPES = new Set(['shelf', 'rack', 'koli', 'sewrack', 'shoerack']);
const ARCH_TYPES = new Set(['wall', 'door', 'window', 'stairs', 'room', 'bath']);

const TYPE_LABEL_MAP: Record<string, string> = {
  shelf: 'Rak Bertingkat',
  rack: 'Rak Gantung',
  koli: 'Blok Koli',
  zone: 'Area / Zona',
  table: 'Meja',
  chair: 'Kursi',
  sewing: 'Mesin Jahit',
  serger: 'Mesin Obras',
  sewrack: 'Rak Alat Jahit',
  shoerack: 'Rak Sepatu',
  stairs: 'Tangga',
  door: 'Pintu',
  wall: 'Dinding',
  window: 'Jendela',
  room: 'Ruangan',
  bath: 'Kamar Mandi',
  laptop: 'Laptop',
  printer: 'Printer',
  bench: 'Bangku',
};

export function expandWmsCodes2D(codeStr?: string): string[] {
  if (!codeStr) return [];
  const raw = String(codeStr).toUpperCase().trim();
  if (!raw) return [];
  const out: string[] = [];
  raw.split(/[,;\s]+/).forEach((part) => {
    if (!part) return;
    const m = part.match(/^([A-Z]+)(\d+)-([A-Z]+)?(\d+)$/);
    if (m) {
      const pref = m[1];
      const start = parseInt(m[2], 10);
      const end = parseInt(m[4], 10);
      const pad = m[2].length;
      if (!isNaN(start) && !isNaN(end) && end >= start && end - start <= 200) {
        for (let i = start; i <= end; i++) {
          out.push(pref + String(i).padStart(pad, '0'));
        }
        return;
      }
    }
    out.push(part);
  });
  return out;
}

function getObjStats(
  o: WarehouseObjItem,
  rackSlotsMap: Record<string, RackSlotSummary>
): {
  codes: string[];
  curQty: number;
  maxCap: number;
  pct: number;
  fillHex: string;
  strokeHex: string;
} | null {
  const codes = expandWmsCodes2D(o.wmsCode);
  if (codes.length === 0) return null;
  let curQty = 0;
  let maxCap = 0;
  for (const c of codes) {
    const sl = rackSlotsMap[c];
    if (sl) {
      curQty += Number(sl.currentQty) || 0;
      maxCap += Number(sl.maxCapacity) || 25;
    } else {
      maxCap += 25;
    }
  }
  const pct = maxCap > 0 ? Math.round((curQty / maxCap) * 100) : 0;
  let fillHex = '#64748b';
  let strokeHex = '#94a3b8';
  if (curQty > 0) {
    if (pct > 100) {
      fillHex = '#e11d48';
      strokeHex = '#fb7185';
    } else if (pct >= 100) {
      fillHex = '#ef4444';
      strokeHex = '#f87171';
    } else if (pct >= 75) {
      fillHex = '#f59e0b';
      strokeHex = '#fbbf24';
    } else {
      fillHex = '#10b981';
      strokeHex = '#34d399';
    }
  }
  return { codes, curQty, maxCap, pct, fillHex, strokeHex };
}

export const Warehouse2DFloorplanEditor: React.FC<Warehouse2DFloorplanEditorProps> = ({
  layout,
  rackSlotsMap,
  heatmapActive,
  onToggleHeatmap,
  onChangeLayout,
  onOpenPrintModal,
  onNotify,
}) => {
  const [activeFloorIdx, setActiveFloorIdx] = useState<number>(() => {
    const cur = Number(layout.cur ?? 2);
    return cur >= 0 && cur < (layout.floors?.length || 1) ? cur : 0;
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [rightTab, setRightTab] = useState<'INSPECTOR' | 'BULK_TABLE'>('INSPECTOR');
  const [zoom, setZoom] = useState<number>(1);
  const [snapStep, setSnapStep] = useState<number>(() => Number(layout.snap ?? 0.05) || 0.05);
  const [showFurniture, setShowFurniture] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [bulkSearch, setBulkSearch] = useState<string>('');
  const [bulkFilter, setBulkFilter] = useState<'ALL' | 'RACKS' | 'ZONES' | 'UNMAPPED'>('ALL');

  // Bulk sequential numbering form (for multi-selected racks)
  const [seqPrefix, setSeqPrefix] = useState<string>('A');
  const [seqStart, setSeqStart] = useState<number>(1);
  const [seqSlotsPerRack, setSeqSlotsPerRack] = useState<number>(5);
  const [seqPad, setSeqPad] = useState<number>(3);
  const [bulkAreaLabel, setBulkAreaLabel] = useState<string>('');

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startMeterX: number;
    startMeterZ: number;
    moved: boolean;
    items: Array<{ id: number; startX: number; startZ: number }>;
  } | null>(null);

  // Clamp floor index when layout changes externally
  useEffect(() => {
    const floorLen = layout.floors?.length || 1;
    if (activeFloorIdx >= floorLen) {
      setActiveFloorIdx(Math.max(0, floorLen - 1));
    }
  }, [layout.floors?.length, activeFloorIdx]);

  const currentFloor: WarehouseFloorSpec = useMemo(() => {
    return (
      layout.floors?.[activeFloorIdx] || {
        L: 15,
        W: 4,
        H: 4,
        fc: '#bdb8b0',
      }
    );
  }, [layout.floors, activeFloorIdx]);

  // All objects on active floor
  const floorObjs = useMemo(() => {
    return (layout.objs || []).filter((o) => o.floor === activeFloorIdx);
  }, [layout.objs, activeFloorIdx]);

  // Map from id -> object
  const objById = useMemo(() => {
    const m = new Map<number, WarehouseObjItem>();
    for (const o of layout.objs || []) {
      m.set(o.id, o);
    }
    return m;
  }, [layout.objs]);

  // Detect overlapping items sharing same (x,z) spot on active floor
  const stackMapBySpot = useMemo(() => {
    const groups = new Map<string, WarehouseObjItem[]>();
    for (const o of floorObjs) {
      if (!STORAGE_TYPES.has(o.type) && o.type !== 'zone') continue;
      const key = `${o.type === 'zone' ? 'z' : 's'}:${Math.round(o.x * 10)}:${Math.round(o.z * 10)}`;
      const list = groups.get(key) || [];
      list.push(o);
      groups.set(key, list);
    }
    return groups;
  }, [floorObjs]);

  const getStackForObj = useCallback(
    (o: WarehouseObjItem): WarehouseObjItem[] => {
      const key = `${o.type === 'zone' ? 'z' : 's'}:${Math.round(o.x * 10)}:${Math.round(o.z * 10)}`;
      return stackMapBySpot.get(key) || [o];
    },
    [stackMapBySpot]
  );

  // Split floor objects into visual layers for crisp SVG z-order
  const layeredFloorObjs = useMemo(() => {
    const zones: WarehouseObjItem[] = [];
    const arch: WarehouseObjItem[] = [];
    const furniture: WarehouseObjItem[] = [];
    const storage: WarehouseObjItem[] = [];

    for (const o of floorObjs) {
      if (o.type === 'zone') zones.push(o);
      else if (ARCH_TYPES.has(o.type)) arch.push(o);
      else if (STORAGE_TYPES.has(o.type)) storage.push(o);
      else furniture.push(o);
    }
    return { zones, arch, furniture, storage };
  }, [floorObjs]);

  const primarySelectedObj = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    return objById.get(selectedIds[0]) || null;
  }, [selectedIds, objById]);

  const primarySelectedStats = useMemo(() => {
    if (!primarySelectedObj) return null;
    return getObjStats(primarySelectedObj, rackSlotsMap);
  }, [primarySelectedObj, rackSlotsMap]);

  const floorStats = useMemo(() => {
    let racks = 0;
    let zones = 0;
    let mapped = 0;
    let unmappedRacks = 0;
    for (const o of floorObjs) {
      if (o.type === 'zone') {
        zones++;
        if (o.wmsCode || o.tg) mapped++;
      } else if (STORAGE_TYPES.has(o.type)) {
        racks++;
        if (o.wmsCode && o.wmsCode.trim()) mapped++;
        else unmappedRacks++;
      }
    }
    return { racks, zones, mapped, unmappedRacks };
  }, [floorObjs]);

  const handleSelectFloor = useCallback(
    (idx: number) => {
      setActiveFloorIdx(idx);
      setSelectedIds([]);
      onChangeLayout({
        ...layout,
        cur: idx,
      });
    },
    [layout, onChangeLayout]
  );

  const updateObjects = useCallback(
    (updater: (objs: WarehouseObjItem[]) => WarehouseObjItem[], nextPartial?: Partial<Warehouse3DLayoutState>) => {
      const nextObjs = updater(layout.objs || []);
      onChangeLayout({
        ...layout,
        ...nextPartial,
        objs: nextObjs,
      });
    },
    [layout, onChangeLayout]
  );

  const handlePatchObj = useCallback(
    (id: number, patch: Partial<WarehouseObjItem>) => {
      updateObjects((objs) =>
        objs.map((o) => (o.id === id ? { ...o, ...patch } : o))
      );
    },
    [updateObjects]
  );

  const handleAddObject = useCallback(
    (type: 'zone' | 'shelf' | 'koli') => {
      const nextUid = Math.max(
        Number(layout.uid || 1),
        ...(layout.objs || []).map((o) => o.id + 1)
      );
      const defaults: Record<'zone' | 'shelf' | 'koli', Partial<WarehouseObjItem>> = {
        zone: {
          n: 'Area Baru',
          tg: 'Zona Baru',
          w: 3.0,
          d: 1.6,
          h: 0.02,
          c: '#4f46e5',
          tc: '#4f46e5',
          wmsCode: '',
        },
        shelf: {
          n: 'Rak Bertingkat',
          tg: '',
          w: 1.2,
          d: 0.5,
          h: 2.2,
          c: '#c9a26b',
          lv: 5,
          wmsCode: '',
        },
        koli: {
          n: 'Koli Baju',
          tg: '',
          w: 0.6,
          d: 1.2,
          h: 1.2,
          c: '#0ea5e9',
          kw: 0.3,
          kd: 0.4,
          kh: 0.3,
          nx: 2,
          nz: 3,
          ny: 4,
          wmsCode: '',
        },
      };
      const offsetCount = floorObjs.filter((o) => o.type === type).length % 5;
      const newObj: WarehouseObjItem = {
        id: nextUid,
        type,
        floor: activeFloorIdx,
        x: Number(((offsetCount - 2) * 0.6).toFixed(2)),
        z: 0,
        rot: 0,
        y: 0,
        ...(defaults[type] as any),
      };
      updateObjects((objs) => [...objs, newObj], { uid: nextUid + 1, cur: activeFloorIdx });
      setSelectedIds([newObj.id]);
      setRightTab('INSPECTOR');
      onNotify?.(`Berhasil menambahkan ${TYPE_LABEL_MAP[type] || type} di Lantai ${activeFloorIdx + 1}.`, 'success');
    },
    [layout.uid, layout.objs, floorObjs, activeFloorIdx, updateObjects, onNotify]
  );

  const handleDuplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    let nextUid = Math.max(
      Number(layout.uid || 1),
      ...(layout.objs || []).map((o) => o.id + 1)
    );
    const created: WarehouseObjItem[] = [];
    for (const id of selectedIds) {
      const src = objById.get(id);
      if (!src) continue;
      const clone: WarehouseObjItem = {
        ...src,
        id: nextUid++,
        x: Number((src.x + 0.5).toFixed(3)),
        z: Number((src.z + 0.5).toFixed(3)),
      };
      delete clone.lk;
      delete clone.gid;
      created.push(clone);
    }
    if (created.length > 0) {
      updateObjects((objs) => [...objs, ...created], { uid: nextUid });
      setSelectedIds(created.map((c) => c.id));
    }
  }, [selectedIds, layout.uid, layout.objs, objById, updateObjects]);

  const handleRotateSelected = useCallback(() => {
    const selectedSet = new Set(selectedIds);
    updateObjects((objs) =>
      objs.map((o) =>
        selectedSet.has(o.id) && !o.lk
          ? { ...o, rot: ((Number(o.rot) || 0) + 90) % 360 }
          : o
      )
    );
  }, [selectedIds, updateObjects]);

  const handleToggleLockSelected = useCallback(
    (forceLock?: boolean) => {
      const selectedSet = new Set(selectedIds);
      const selectedList = selectedIds.map((id) => objById.get(id)).filter((x): x is WarehouseObjItem => Boolean(x));
      if (selectedList.length === 0) return;
      const shouldLock = typeof forceLock === 'boolean' ? forceLock : !selectedList.every((o) => Boolean(o.lk));
      updateObjects((objs) =>
        objs.map((o) => {
          if (!selectedSet.has(o.id)) return o;
          if (shouldLock) return { ...o, lk: 1 };
          const copy = { ...o };
          delete copy.lk;
          return copy;
        })
      );
    },
    [selectedIds, objById, updateObjects]
  );

  const handleDeleteSelected = useCallback(() => {
    const selectedSet = new Set(selectedIds);
    const deletable = selectedIds.filter((id) => {
      const o = objById.get(id);
      return o && !o.lk;
    });
    if (deletable.length === 0) {
      onNotify?.('Aset terkunci. Buka kunci terlebih dahulu untuk menghapus.', 'warning');
      return;
    }
    updateObjects((objs) => objs.filter((o) => !(selectedSet.has(o.id) && !o.lk)));
    setSelectedIds((prev) => prev.filter((id) => !deletable.includes(id)));
  }, [selectedIds, objById, updateObjects, onNotify]);

  // Apply sequential location codes to multi-selected racks
  const handleApplySequentialCodes = useCallback(() => {
    if (selectedIds.length === 0) return;
    const prefixClean = seqPrefix.trim().toUpperCase() || 'A';
    const padLen = Math.max(1, Math.min(5, seqPad || 3));
    const step = Math.max(1, seqSlotsPerRack || 1);
    let cursor = Math.max(1, seqStart || 1);

    // Sort selected objects naturally: Left -> Right (x asc), then Back -> Front (z asc)
    const sorted = selectedIds
      .map((id) => objById.get(id))
      .filter((x): x is WarehouseObjItem => Boolean(x))
      .sort((a, b) => {
        if (Math.abs(a.z - b.z) > 0.35) return a.z - b.z;
        return a.x - b.x;
      });

    const codeById = new Map<number, string>();
    for (const o of sorted) {
      const startStr = prefixClean + String(cursor).padStart(padLen, '0');
      if (step === 1) {
        codeById.set(o.id, startStr);
      } else {
        const endStr = prefixClean + String(cursor + step - 1).padStart(padLen, '0');
        codeById.set(o.id, `${startStr}-${endStr}`);
      }
      cursor += step;
    }

    updateObjects((objs) =>
      objs.map((o) => {
        const newCode = codeById.get(o.id);
        if (!newCode) return o;
        return {
          ...o,
          wmsCode: newCode,
          ...(bulkAreaLabel.trim() ? { tg: bulkAreaLabel.trim() } : {}),
        };
      })
    );

    onNotify?.(
      `Kode lokasi berurutan berhasil diterapkan ke ${sorted.length} objek terpilih.`,
      'success'
    );
  }, [selectedIds, seqPrefix, seqStart, seqSlotsPerRack, seqPad, bulkAreaLabel, objById, updateObjects, onNotify]);

  const handleApplyBulkAreaLabel = useCallback(() => {
    if (selectedIds.length === 0 || !bulkAreaLabel.trim()) return;
    const setIds = new Set(selectedIds);
    updateObjects((objs) =>
      objs.map((o) => (setIds.has(o.id) ? { ...o, tg: bulkAreaLabel.trim() } : o))
    );
    onNotify?.(`Label area "${bulkAreaLabel.trim()}" diterapkan ke ${selectedIds.length} objek.`, 'success');
  }, [selectedIds, bulkAreaLabel, updateObjects, onNotify]);

  // SVG ViewBox calculation in meters with generous margin
  const padX = 1.6;
  const padZ = 1.4;
  const baseW = Math.max(4, currentFloor.L) + padX * 2;
  const baseH = Math.max(3, currentFloor.W) + padZ * 2;
  const vbWidth = baseW / zoom;
  const vbHeight = baseH / zoom;
  const vbX = -vbWidth / 2;
  const vbY = -vbHeight / 2;

  const clientToMeters = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, z: 0 };
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, z: 0 };
    const vb = svg.viewBox.baseVal;
    const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
    const renderedW = vb.width * scale;
    const renderedH = vb.height * scale;
    const offsetX = rect.left + (rect.width - renderedW) / 2;
    const offsetY = rect.top + (rect.height - renderedH) / 2;
    return {
      x: vb.x + (clientX - offsetX) / scale,
      z: vb.y + (clientY - offsetY) / scale,
    };
  }, []);

  const handlePointerDownObj = useCallback(
    (e: React.PointerEvent, obj: WarehouseObjItem) => {
      e.stopPropagation();
      const isMultiKey = e.shiftKey || e.ctrlKey || e.metaKey;

      let nextSelection = selectedIds;
      if (isMultiKey) {
        nextSelection = selectedIds.includes(obj.id)
          ? selectedIds.filter((id) => id !== obj.id)
          : [...selectedIds, obj.id];
        setSelectedIds(nextSelection);
        return;
      }

      // If clicking on an un-selected object, check if it's in a stack & already selected another item in stack?
      if (!selectedIds.includes(obj.id)) {
        nextSelection = [obj.id];
        setSelectedIds(nextSelection);
      }

      // Prepare drag if unlocked
      const draggableItems = nextSelection
        .map((id) => objById.get(id))
        .filter((o): o is WarehouseObjItem => Boolean(o && !o.lk));

      if (draggableItems.length === 0) return;

      const m = clientToMeters(e.clientX, e.clientY);
      dragStateRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startMeterX: m.x,
        startMeterZ: m.z,
        moved: false,
        items: draggableItems.map((it) => ({ id: it.id, startX: it.x, startZ: it.z })),
      };
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {}
    },
    [selectedIds, objById, clientToMeters]
  );

  const handleSvgPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      if (!ds.moved && Math.hypot(e.clientX - ds.startClientX, e.clientY - ds.startClientY) < 4) {
        return;
      }
      ds.moved = true;
      const m = clientToMeters(e.clientX, e.clientY);
      const snap = (v: number) => (snapStep > 0 ? Math.round(v / snapStep) * snapStep : v);
      const rawDx = m.x - ds.startMeterX;
      const rawDz = m.z - ds.startMeterZ;
      const maxLimX = currentFloor.L / 2 + 2;
      const maxLimZ = currentFloor.W / 2 + 2;

      const itemPosMap = new Map<number, { x: number; z: number }>();
      for (const it of ds.items) {
        const nx = Math.max(-maxLimX, Math.min(maxLimX, snap(it.startX + rawDx)));
        const nz = Math.max(-maxLimZ, Math.min(maxLimZ, snap(it.startZ + rawDz)));
        itemPosMap.set(it.id, { x: Number(nx.toFixed(3)), z: Number(nz.toFixed(3)) });
      }

      updateObjects((objs) =>
        objs.map((o) => {
          const p = itemPosMap.get(o.id);
          return p ? { ...o, x: p.x, z: p.z } : o;
        })
      );
    },
    [clientToMeters, snapStep, currentFloor.L, currentFloor.W, updateObjects]
  );

  const handleSvgPointerUp = useCallback(() => {
    dragStateRef.current = null;
  }, []);

  // Bulk list for Right Tab 2
  const bulkFilteredObjs = useMemo(() => {
    const q = bulkSearch.trim().toUpperCase();
    return floorObjs
      .filter((o) => {
        if (ARCH_TYPES.has(o.type) && o.type !== 'room') return false;
        if (bulkFilter === 'RACKS' && !STORAGE_TYPES.has(o.type)) return false;
        if (bulkFilter === 'ZONES' && o.type !== 'zone') return false;
        if (bulkFilter === 'UNMAPPED' && !(STORAGE_TYPES.has(o.type) && !o.wmsCode)) return false;
        if (q) {
          const hay = `${o.wmsCode || ''} ${o.tg || ''} ${o.n || ''} ${o.type}`.toUpperCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.type === 'zone' && b.type !== 'zone') return -1;
        if (a.type !== 'zone' && b.type === 'zone') return 1;
        return (a.wmsCode || a.tg || a.n).localeCompare(b.wmsCode || b.tg || b.n, undefined, {
          numeric: true,
        });
      });
  }, [floorObjs, bulkSearch, bulkFilter]);

  const activeStack = useMemo(() => {
    if (!primarySelectedObj) return [];
    return getStackForObj(primarySelectedObj);
  }, [primarySelectedObj, getStackForObj]);

  // Meter grid ticks
  const gridTicks = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    const halfL = Math.ceil(currentFloor.L / 2);
    const halfW = Math.ceil(currentFloor.W / 2);
    for (let x = -halfL; x <= halfL; x++) xs.push(x);
    for (let z = -halfW; z <= halfW; z++) zs.push(z);
    return { xs, zs };
  }, [currentFloor.L, currentFloor.W]);

  const renderSvgObj = (o: WarehouseObjItem) => {
    const isSelected = selectedIds.includes(o.id);
    const isZone = o.type === 'zone';
    const isStorage = STORAGE_TYPES.has(o.type);
    const isArch = ARCH_TYPES.has(o.type);
    const stats = isStorage || isZone ? getObjStats(o, rackSlotsMap) : null;
    const stack = isStorage ? getStackForObj(o) : [o];
    const hasStack = stack.length > 1;
    const isTopOfStack = !hasStack || stack[stack.length - 1].id === o.id || stack.some((s) => selectedIds.includes(s.id)) && (isSelected || (!selectedIds.some((id) => stack.some((s) => s.id === id)) && stack[stack.length - 1].id === o.id));
    if (hasStack && !isTopOfStack && !isSelected) return null;

    const rotDeg = -(Number(o.rot) || 0);
    const w = Math.max(0.15, Number(o.w) || 0.5);
    const d = Math.max(0.12, Number(o.d) || 0.4);

    let fillColor = o.c || '#64748b';
    let fillOpacity = 0.88;
    let strokeColor = isSelected ? '#4f46e5' : '#1e293b';
    let strokeWidth = isSelected ? 0.06 : 0.025;

    if (isZone) {
      fillColor = o.tc || o.c || '#3b82f6';
      fillOpacity = isSelected ? 0.28 : 0.16;
      strokeColor = isSelected ? '#4f46e5' : o.tc || o.c || '#3b82f6';
      strokeWidth = isSelected ? 0.05 : 0.03;
    } else if (isStorage) {
      if (heatmapActive && stats) {
        fillColor = stats.fillHex;
        fillOpacity = 0.85;
        strokeColor = isSelected ? '#ffffff' : stats.strokeHex;
      } else {
        fillColor = o.wmsCode ? o.c || '#c9a26b' : '#475569';
        fillOpacity = o.wmsCode ? 0.92 : 0.6;
        strokeColor = isSelected ? '#6366f1' : o.wmsCode ? '#0f172a' : '#94a3b8';
      }
    } else if (isArch) {
      fillColor = o.type === 'stairs' ? '#92400e' : o.type === 'bath' ? '#475569' : '#64748b';
      fillOpacity = o.type === 'wall' ? 0.9 : 0.45;
      strokeColor = isSelected ? '#6366f1' : '#334155';
    } else {
      fillOpacity = 0.45;
      strokeColor = isSelected ? '#6366f1' : '#475569';
    }

    const labelText = o.wmsCode || o.tg || (isZone ? o.n : '');
    const subLabel = isZone && o.tg && o.n && o.tg !== o.n ? o.n : '';

    return (
      <g
        key={o.id}
        transform={`translate(${o.x}, ${o.z}) rotate(${rotDeg})`}
        onPointerDown={(e) => handlePointerDownObj(e, o)}
        className={o.lk ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
      >
        <rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          rx={isZone ? 0.08 : 0.03}
          fill={fillColor}
          fillOpacity={fillOpacity}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={isZone ? '0.12 0.08' : undefined}
        />

        {isSelected && (
          <rect
            x={-w / 2 - 0.05}
            y={-d / 2 - 0.05}
            width={w + 0.1}
            height={d + 0.1}
            rx={0.05}
            fill="none"
            stroke="#6366f1"
            strokeWidth={0.04}
          />
        )}

        {/* Label inside shape */}
        {showLabels && labelText && (isStorage || isZone || o.tg) && (
          <g transform={`rotate(${-rotDeg})`}>
            <text
              x={0}
              y={stats && isStorage ? -0.02 : subLabel ? -0.04 : 0.04}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={isZone ? 0.22 : Math.min(0.18, Math.max(0.11, Math.min(w, d) * 0.28))}
              fontWeight={800}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fill={isZone ? '#1e293b' : '#ffffff'}
              className="pointer-events-none select-none dark:fill-white"
              style={{
                paintOrder: 'stroke',
                stroke: isZone ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)',
                strokeWidth: 0.035,
              }}
            >
              {labelText.length > 14 ? `${labelText.slice(0, 13)}…` : labelText}
            </text>
            {isStorage && stats && (
              <text
                x={0}
                y={0.14}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={0.11}
                fontWeight={700}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill="#e2e8f0"
                className="pointer-events-none select-none"
                style={{
                  paintOrder: 'stroke',
                  stroke: 'rgba(15,23,42,0.9)',
                  strokeWidth: 0.03,
                }}
              >
                {stats.pct}% ({stats.curQty})
              </text>
            )}
            {isZone && subLabel && (
              <text
                x={0}
                y={0.18}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={0.13}
                fontWeight={700}
                fill="#475569"
                className="pointer-events-none select-none dark:fill-slate-300"
              >
                {subLabel}
              </text>
            )}
          </g>
        )}

        {/* Overlap stack count badge (e.g. x4 racks stacked at same x,z) */}
        {hasStack && (
          <g transform={`translate(${w / 2 - 0.04}, ${-d / 2 + 0.04}) rotate(${-rotDeg})`}>
            <circle r={0.16} fill="#4f46e5" stroke="#ffffff" strokeWidth={0.025} />
            <text
              x={0}
              y={0.01}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={0.13}
              fontWeight={900}
              fill="#ffffff"
              className="pointer-events-none select-none font-mono"
            >
              ×{stack.length}
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 w-full min-w-0">
      {/* =====================================================================
          LEFT / MAIN: INTERACTIVE 2D ARCHITECTURAL FLOORPLAN CANVAS
          ===================================================================== */}
      <div className="lg:col-span-8 xl:col-span-9 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl p-3 space-y-2.5 flex flex-col min-w-0">
        {/* Floor Tabs & Quick Placement Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          {/* Floor Selector */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar whitespace-nowrap">
            {(layout.floors || []).map((fl, idx) => {
              const isAct = idx === activeFloorIdx;
              const label = FLOOR_LABELS[idx] || `Lantai ${idx + 1}`;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectFloor(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 border ${
                    isAct
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-slate-50 dark:bg-[#0E1420] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`text-[10px] font-mono ${
                      isAct ? 'text-indigo-100' : 'text-slate-400'
                    }`}
                  >
                    {fl.L}×{fl.W}m
                  </span>
                  {Boolean(fl.lk) && <Lock className="w-3 h-3 opacity-80" />}
                </button>
              );
            })}
          </div>

          {/* Add Objects on Active Floor */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleAddObject('zone')}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 cursor-pointer"
              title="Tambah kotak Penanda Area / Zona di lantai aktif"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Area / Zona</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddObject('shelf')}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer"
              title="Tambah Rak baru di lantai aktif"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Rak</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddObject('koli')}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer"
              title="Tambah Blok Koli baru di lantai aktif"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Koli</span>
            </button>
          </div>
        </div>

        {/* Canvas Utility Bar: Zoom, Snap, Toggles, Stats */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Zoom Controls */}
            <div className="inline-flex items-center bg-slate-100 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(1))))}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                title="Perkecil Denah"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono font-bold text-[11px] text-slate-700 dark:text-slate-200 tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.6, Number((z + 0.2).toFixed(1))))}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                title="Perbesar Denah"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                title="Reset Zoom 100%"
              >
                Fit
              </button>
            </div>

            {/* Snap Step */}
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <Grid className="w-3.5 h-3.5 text-slate-400" />
              <span>Snap:</span>
              <select
                value={snapStep}
                onChange={(e) => setSnapStep(Number(e.target.value))}
                className="bg-transparent font-mono font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value={0}>Bebas</option>
                <option value={0.05}>5 cm</option>
                <option value={0.1}>10 cm</option>
                <option value={0.25}>25 cm</option>
                <option value={0.5}>50 cm</option>
              </select>
            </label>

            <button
              type="button"
              onClick={onToggleHeatmap}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 cursor-pointer transition-colors ${
                heatmapActive
                  ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${heatmapActive ? 'text-amber-500' : 'text-slate-400'}`} />
              <span>Heatmap</span>
            </button>

            <button
              type="button"
              onClick={() => setShowLabels((v) => !v)}
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer"
            >
              {showLabels ? <Eye className="w-3.5 h-3.5 text-indigo-500" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
              <span>Label</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFurniture((v) => !v)}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 cursor-pointer ${
                showFurniture
                  ? 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  : 'bg-slate-100 dark:bg-[#0E1420] text-slate-400 border-slate-200 dark:border-slate-800'
              }`}
            >
              <span>Furnitur: {showFurniture ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>{floorStats.zones} Zona</span>
            <span aria-hidden="true">·</span>
            <span>{floorStats.racks} Rak</span>
            {floorStats.unmappedRacks > 0 && (
              <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-sans font-bold">
                {floorStats.unmappedRacks} belum berkode
              </span>
            )}
          </div>
        </div>

        {/* Interactive SVG Floorplan Viewport */}
        <div className="relative flex-1 min-h-[480px] lg:min-h-[580px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#0b1324] overflow-hidden select-none">
          <svg
            ref={svgRef}
            viewBox={`${vbX} ${vbY} ${vbWidth} ${vbHeight}`}
            className="w-full h-full block touch-none"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget || (e.target as Element)?.getAttribute('data-bg') === '1') {
                setSelectedIds([]);
              }
            }}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
          >
            {/* Outer Background Hit Target */}
            <rect
              data-bg="1"
              x={vbX - 5}
              y={vbY - 5}
              width={vbWidth + 10}
              height={vbHeight + 10}
              fill="transparent"
            />

            {/* Floor Slab */}
            <rect
              data-bg="1"
              x={-currentFloor.L / 2}
              y={-currentFloor.W / 2}
              width={currentFloor.L}
              height={currentFloor.W}
              rx={0.06}
              fill={currentFloor.fc || '#bdb8b0'}
              fillOpacity={0.22}
              stroke="#64748b"
              strokeWidth={0.05}
            />

            {/* 1m Blueprint Grid Lines & Meter Rulers */}
            {gridTicks.xs.map((gx) => (
              <g key={`gx-${gx}`} className="pointer-events-none">
                <line
                  x1={gx}
                  y1={-currentFloor.W / 2}
                  x2={gx}
                  y2={currentFloor.W / 2}
                  stroke="#94a3b8"
                  strokeOpacity={gx === 0 ? 0.45 : 0.22}
                  strokeWidth={gx === 0 ? 0.025 : 0.015}
                />
                <text
                  x={gx}
                  y={-currentFloor.W / 2 - 0.18}
                  textAnchor="middle"
                  fontSize={0.18}
                  fontFamily="monospace"
                  fill="#64748b"
                >
                  {gx}m
                </text>
              </g>
            ))}
            {gridTicks.zs.map((gz) => (
              <g key={`gz-${gz}`} className="pointer-events-none">
                <line
                  x1={-currentFloor.L / 2}
                  y1={gz}
                  x2={currentFloor.L / 2}
                  y2={gz}
                  stroke="#94a3b8"
                  strokeOpacity={gz === 0 ? 0.45 : 0.22}
                  strokeWidth={gz === 0 ? 0.025 : 0.015}
                />
                <text
                  x={-currentFloor.L / 2 - 0.22}
                  y={gz + 0.06}
                  textAnchor="end"
                  fontSize={0.18}
                  fontFamily="monospace"
                  fill="#64748b"
                >
                  {gz}m
                </text>
              </g>
            ))}

            {/* Layer 1: Area Zones (background regions) */}
            {layeredFloorObjs.zones.map(renderSvgObj)}

            {/* Layer 2: Architecture (stairs, walls, doors, bath) */}
            {layeredFloorObjs.arch.map(renderSvgObj)}

            {/* Layer 3: Furniture (optional toggle) */}
            {showFurniture && layeredFloorObjs.furniture.map(renderSvgObj)}

            {/* Layer 4: Storage Racks & Koli (foreground) */}
            {layeredFloorObjs.storage.map(renderSvgObj)}
          </svg>

          {/* Bottom Canvas Legend & Tip */}
          <div className="absolute bottom-2.5 left-2.5 right-2.5 pointer-events-none flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="pointer-events-auto px-2.5 py-1 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-xs">
              Klik objek untuk edit area &amp; kode · Seret untuk geser posisi ·{' '}
              <kbd className="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-mono text-[10px]">
                Shift
              </kbd>{' '}
              + Klik untuk pilih banyak rak
            </div>

            {selectedIds.length > 0 && (
              <div className="pointer-events-auto px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold shadow-xs flex items-center gap-2">
                <span>{selectedIds.length} objek terpilih</span>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="hover:text-indigo-200 cursor-pointer"
                  title="Batalkan Pilihan"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          RIGHT PANEL: SETUP AREA NAMING, LOCATION CODES & BULK TABLE
          ===================================================================== */}
      <div className="lg:col-span-4 xl:col-span-3 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-col gap-3 min-w-0">
        {/* Panel Mode Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-[#0E1420] rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setRightTab('INSPECTOR')}
            className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              rightTab === 'INSPECTOR'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Setup Terpilih</span>
          </button>
          <button
            type="button"
            onClick={() => setRightTab('BULK_TABLE')}
            className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              rightTab === 'BULK_TABLE'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>Daftar &amp; Massal</span>
          </button>
        </div>

        {rightTab === 'INSPECTOR' ? (
          <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 max-h-[600px]">
            {/* CASE A: MULTI-SELECTION */}
            {selectedIds.length > 1 ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/35 border border-indigo-200 dark:border-indigo-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-indigo-950 dark:text-indigo-200">
                      {selectedIds.length} Objek Dipilih
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Batal Pilih
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={handleRotateSelected}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCw className="w-3 h-3" /> Putar 90°
                    </button>
                    <button
                      type="button"
                      onClick={handleDuplicateSelected}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" /> Duplikat
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleLockSelected()}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      <Lock className="w-3 h-3" /> Kunci/Buka
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Hapus
                    </button>
                  </div>
                </div>

                {/* Bulk Area Label */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Penamaan Area Massal</span>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={bulkAreaLabel}
                      onChange={(e) => setBulkAreaLabel(e.target.value)}
                      placeholder="Mis. Section A - DRESS"
                      className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={handleApplyBulkAreaLabel}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shrink-0"
                    >
                      Terapkan
                    </button>
                  </div>
                </div>

                {/* Sequential Auto-Numbering WMS Location Codes */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Penomoran Kode Rak Berurutan</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    Mengisi kode lokasi WMS otomatis (kiri ➔ kanan, belakang ➔ depan).
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-500">Prefix</span>
                      <input
                        type="text"
                        value={seqPrefix}
                        onChange={(e) => setSeqPrefix(e.target.value.toUpperCase())}
                        placeholder="A"
                        className="w-full px-2.5 py-1.5 font-mono font-bold rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-500">Mulai Nomor</span>
                      <input
                        type="number"
                        min={1}
                        value={seqStart}
                        onChange={(e) => setSeqStart(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full px-2.5 py-1.5 font-mono rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-500">Slot per Rak</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={seqSlotsPerRack}
                        onChange={(e) => setSeqSlotsPerRack(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full px-2.5 py-1.5 font-mono rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-bold text-slate-500">Digit Pad</span>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={seqPad}
                        onChange={(e) => setSeqPad(Math.max(1, Number(e.target.value) || 3))}
                        className="w-full px-2.5 py-1.5 font-mono rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplySequentialCodes}
                    className="w-full py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-2xs"
                  >
                    Terapkan Kode ke {selectedIds.length} Objek
                  </button>
                </div>
              </div>
            ) : primarySelectedObj ? (
              /* CASE B: SINGLE OBJECT SELECTED */
              <div className="space-y-3">
                {/* Stack Switcher when multiple racks share exact (x, z) */}
                {activeStack.length > 1 && (
                  <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/35 border border-indigo-200 dark:border-indigo-800 space-y-1.5">
                    <div className="text-[11px] font-extrabold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      <span>{activeStack.length} Rak Bertumpuk di Titik Ini:</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {activeStack.map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setSelectedIds([st.id])}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border cursor-pointer ${
                            st.id === primarySelectedObj.id
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {st.wmsCode || st.tg || `#${st.id}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Header Badge + Quick Lock/Rotate/Dup/Del */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      {TYPE_LABEL_MAP[primarySelectedObj.type] || primarySelectedObj.type} · Lantai {primarySelectedObj.floor + 1}
                    </span>
                    <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                      {primarySelectedObj.wmsCode || primarySelectedObj.tg || primarySelectedObj.n}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleLockSelected()}
                      className={`p-1.5 rounded-lg border cursor-pointer ${
                        primarySelectedObj.lk
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 border-amber-300 dark:border-amber-700'
                          : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                      }`}
                      title={primarySelectedObj.lk ? 'Buka Kunci Posisi' : 'Kunci Posisi'}
                    >
                      {primarySelectedObj.lk ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(primarySelectedObj.lk)}
                      onClick={handleRotateSelected}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                      title="Putar 90°"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDuplicateSelected}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                      title="Duplikat"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(primarySelectedObj.lk)}
                      onClick={handleDeleteSelected}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 disabled:opacity-40 cursor-pointer"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Penamaan Area / Label Penanda */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    Penamaan Area / Label Penanda
                  </label>
                  <input
                    type="text"
                    value={primarySelectedObj.tg || ''}
                    onChange={(e) => handlePatchObj(primarySelectedObj.id, { tg: e.target.value })}
                    placeholder="Mis. Section A - DRESS atau Area Live"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                  {/* Quick Preset Chips */}
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {AREA_PRESETS.slice(0, 6).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handlePatchObj(primarySelectedObj.id, { tg: preset })}
                        className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-[10px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nama Objek */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    Nama Objek
                  </label>
                  <input
                    type="text"
                    value={primarySelectedObj.n || ''}
                    onChange={(e) => handlePatchObj(primarySelectedObj.id, { n: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                {/* Kode Lokasi WMS */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    Kode Lokasi WMS (Rentang atau Daftar)
                  </label>
                  <input
                    type="text"
                    value={primarySelectedObj.wmsCode || ''}
                    onChange={(e) =>
                      handlePatchObj(primarySelectedObj.id, { wmsCode: e.target.value.toUpperCase() })
                    }
                    placeholder="A001-A005, STUDIO, SHOPEE,TIKTOK"
                    className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                  <div className="flex flex-wrap gap-1">
                    {['STUDIO', 'SHOPEE,TIKTOK', 'IGLIVE', 'TRANSIT'].map((token) => (
                      <button
                        key={token}
                        type="button"
                        onClick={() => handlePatchObj(primarySelectedObj.id, { wmsCode: token })}
                        className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live WMS Slot Preview */}
                {primarySelectedStats && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        Stok Live ({primarySelectedStats.codes.length} slot)
                      </span>
                      <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">
                        {primarySelectedStats.curQty}/{primarySelectedStats.maxCap} pcs ({primarySelectedStats.pct}%)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {primarySelectedStats.codes.map((code) => {
                        const sl = rackSlotsMap[code];
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => onOpenPrintModal?.(code)}
                            className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200 hover:border-indigo-400 cursor-pointer flex items-center gap-1"
                            title="Klik untuk detail/cetak rak"
                          >
                            <Printer className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                            <span>{code}</span>
                            {sl && (
                              <span className="text-slate-400">
                                {sl.currentQty}/{sl.maxCapacity}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Color Swatches */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    Warna Area / Objek
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {QUICK_COLOR_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() =>
                          handlePatchObj(
                            primarySelectedObj.id,
                            primarySelectedObj.type === 'zone' ? { c: hex, tc: hex } : { c: hex }
                          )
                        }
                        className={`w-5 h-5 rounded-full border cursor-pointer transition-transform ${
                          (primarySelectedObj.c || '').toLowerCase() === hex
                            ? 'scale-110 ring-2 ring-indigo-500 border-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))}
                    <input
                      type="color"
                      value={primarySelectedObj.c || '#4f46e5'}
                      onChange={(e) =>
                        handlePatchObj(
                          primarySelectedObj.id,
                          primarySelectedObj.type === 'zone'
                            ? { c: e.target.value, tc: e.target.value }
                            : { c: e.target.value }
                        )
                      }
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                    />
                  </div>
                </div>

                {/* Dimensions & Coordinates */}
                <div className="grid grid-cols-3 gap-1.5 text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                  {(
                    [
                      { key: 'x', label: 'Posisi X', step: 0.05 },
                      { key: 'z', label: 'Posisi Z', step: 0.05 },
                      { key: 'rot', label: 'Rotasi (°)', step: 15 },
                      { key: 'w', label: 'Panjang (m)', step: 0.1 },
                      { key: 'd', label: 'Lebar (m)', step: 0.1 },
                      { key: 'h', label: 'Tinggi (m)', step: 0.1 },
                    ] as const
                  ).map((fld) => {
                    const lockedField = Boolean(primarySelectedObj.lk) && ['x', 'z', 'rot'].includes(fld.key);
                    return (
                      <label key={fld.key} className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-500">{fld.label}</span>
                        <input
                          type="number"
                          step={fld.step}
                          disabled={lockedField}
                          value={Number((primarySelectedObj as any)[fld.key] ?? 0)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (isNaN(val)) return;
                            if (['w', 'd', 'h'].includes(fld.key) && val <= 0.01) return;
                            handlePatchObj(primarySelectedObj.id, { [fld.key]: val });
                          }}
                          className="w-full px-2 py-1 text-xs font-mono rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white disabled:opacity-50"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* CASE C: NO SELECTION — OVERVIEW + UNMAPPED RACKS */
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <MapIcon className="w-4 h-4 text-indigo-500" />
                    <span>Setup Denah Lantai {activeFloorIdx + 1}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Klik objek pada denah 2D di samping untuk mengubah penamaan area dan kode lokasi WMS, atau gunakan tab{' '}
                    <strong>Daftar &amp; Massal</strong> untuk mengisi cepat lewat tabel.
                  </p>
                </div>

                {/* Quick List of Existing Zones on this Floor */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Area / Zona di Lantai {activeFloorIdx + 1} ({layeredFloorObjs.zones.length})
                  </div>
                  {layeredFloorObjs.zones.length === 0 ? (
                    <div className="p-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-[11px] text-slate-400 text-center">
                      Belum ada area di lantai ini. Klik &ldquo;+ Area / Zona&rdquo; di atas.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {layeredFloorObjs.zones.map((z) => (
                        <button
                          key={z.id}
                          type="button"
                          onClick={() => setSelectedIds([z.id])}
                          className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1420] hover:border-indigo-400 text-left flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: z.tc || z.c || '#4f46e5' }}
                            />
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {z.tg || z.n}
                            </span>
                          </div>
                          {z.wmsCode && (
                            <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                              {z.wmsCode}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unmapped Racks Alert */}
                {floorStats.unmappedRacks > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Rak Belum Berkode WMS ({floorStats.unmappedRacks})</span>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {layeredFloorObjs.storage
                        .filter((r) => !r.wmsCode)
                        .map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedIds([r.id])}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-left flex items-center justify-between text-xs cursor-pointer hover:border-amber-400"
                          >
                            <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                              {r.tg || r.n} (#{r.id})
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              ({r.x.toFixed(1)}, {r.z.toFixed(1)})
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* TAB 2: BULK INLINE TABLE FOR RAPID AREA & CODE SETUP */
          <div className="flex-1 flex flex-col gap-2 min-h-0 max-h-[600px]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={bulkSearch}
                onChange={(e) => setBulkSearch(e.target.value)}
                placeholder="Cari nama area / kode rak..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[11px]">
              {(
                [
                  { id: 'ALL', label: 'Semua' },
                  { id: 'RACKS', label: 'Rak & Koli' },
                  { id: 'ZONES', label: 'Area / Zona' },
                  { id: 'UNMAPPED', label: 'Belum Berkode' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setBulkFilter(f.id)}
                  className={`px-2 py-1 rounded-lg font-bold border whitespace-nowrap cursor-pointer ${
                    bulkFilter === f.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-[#0E1420] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
              {bulkFilteredObjs.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Tidak ada objek pada filter ini.
                </div>
              ) : (
                bulkFilteredObjs.map((o) => {
                  const isSel = selectedIds.includes(o.id);
                  const st = getObjStats(o, rackSlotsMap);
                  return (
                    <div
                      key={o.id}
                      className={`p-2 rounded-xl border space-y-1.5 transition-colors ${
                        isSel
                          ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-400 dark:border-indigo-700'
                          : 'bg-slate-50/60 dark:bg-[#0E1420] border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedIds([o.id])}
                          className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer truncate"
                          title="Sorot di denah 2D"
                        >
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span>
                            {TYPE_LABEL_MAP[o.type] || o.type} #{o.id}
                          </span>
                        </button>
                        {st && (
                          <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 shrink-0">
                            {st.curQty}/{st.maxCap} ({st.pct}%)
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          value={o.tg || ''}
                          onChange={(e) => handlePatchObj(o.id, { tg: e.target.value })}
                          placeholder="Label Area"
                          className="px-2 py-1 text-[11px] rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          value={o.wmsCode || ''}
                          onChange={(e) =>
                            handlePatchObj(o.id, { wmsCode: e.target.value.toUpperCase() })
                          }
                          placeholder="Kode WMS (A001-A005)"
                          className="px-2 py-1 text-[11px] font-mono font-bold rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Warehouse2DFloorplanEditor;
