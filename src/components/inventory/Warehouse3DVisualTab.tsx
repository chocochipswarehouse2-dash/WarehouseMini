import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Box,
  Flame,
  Palette,
  RefreshCw,
  CloudUpload,
  Sparkles,
  Maximize2,
  Minimize2,
  MapPin,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Tag,
  RotateCcw,
  Eye,
  EyeOff,
  PanelLeft,
  PanelLeftClose,
  X,
  Presentation,
  Tv,
  Play,
  Pause,
  Compass,
} from 'lucide-react';
import type { StockRealtimeItem, ProductItem, UserSession } from '../../types';
import { cleanProductName, extractCleanSizeToken, extractSizeFromSku } from '../../utils/sortUtils';
import {
  loadLocalRackCapacityConfig,
  fetchRackCapacityConfig,
  computeAllRackSlots,
  type RackCapacityConfig,
  type ComputedRackSlot,
  type EnrichedCatalogEntry,
} from '../../services/rackCapacityService';
import { getSystemDocs, saveSystemDoc } from '../../services/supabase';

const WAREHOUSE_3D_DOC_KEY = 'warehouse_3d_layout_v1';
const LOCAL_STORAGE_3D_KEY = 'wms3d';

export interface Warehouse3DVisualTabProps {
  stockRows: StockRealtimeItem[];
  productCatalog?: ProductItem[];
  session?: UserSession | null;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onOpenPrintModal?: (lokasi: string) => void;
  onRefreshStock?: () => void;
  isRefreshingStock?: boolean;
}

export interface Selected3DRackInfo {
  objId: number;
  name: string;
  type: string;
  floor: number;
  wmsCode: string;
  matchedSlots: ComputedRackSlot[];
  totalCurrentQty: number;
  totalMaxCapacity: number;
  fillPercent: number;
}

// Default Seed Layout from attached gudang-3d-dengan-data_79d06cf8.html
const DEFAULT_WAREHOUSE_3D_SEED = {
  floors: [
    { L: 16.6, W: 4, H: 4, fc: '#808040' },
    { L: 15, W: 4, H: 4, fc: '#7a5230', ox: -0.8, oz: 0, lk: 1 },
    { L: 15, W: 4, H: 4, fc: '#bdb8b0', ox: -0.8, oz: 0 },
    { L: 12, W: 4, H: 4, fc: '#bdb8b0' },
  ],
  objs: [
    { id: 1, type: 'stairs', floor: 0, x: 2.1, z: 1, rot: 0, y: 0, n: 'Tangga', w: 1.2, d: 2, h: 4, c: '#804040', mir: true, lk: 1 },
    { id: 3, type: 'door', floor: 0, x: -8.4, z: 0.6500000000000001, rot: 90, y: 0, n: 'Pintu', w: 0.9, d: 0.12, h: 2.1, c: '#c0c0c0', gid: 3, lk: 1 },
    { id: 4, type: 'door', floor: 0, x: -8.4, z: -0.2500000000000001, rot: 90, y: 0, n: 'Pintu', w: 0.9, d: 0.12, h: 2.1, c: '#c0c0c0', gid: 3, lk: 1 },
    { id: 5, type: 'wall', floor: 0, x: -5.91, z: -0.5, rot: 90, y: 0, n: 'Dinding Partisi', w: 2.5, d: 0.12, h: 2.6, c: '#ff80c0', lk: 1 },
    { id: 6, type: 'shelf', floor: 0, x: -7.08, z: 1.7000000000000002, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, wmsCode: 'STUDIO' },
    { id: 7, type: 'shelf', floor: 0, x: -5.91, z: 1.7000000000000002, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, wmsCode: 'SHOPEE,TIKTOK' },
    { id: 8, type: 'table', floor: 0, x: -5.6, z: -0.1, rot: 90, y: 0, n: 'Meja', w: 1.2, d: 0.5, h: 0.75, c: '#3e1ed7' },
    { id: 9, type: 'table', floor: 0, x: -4.1, z: -1.65, rot: 0, y: 0, n: 'Meja', w: 1.2, d: 0.5, h: 0.75, c: '#3e1ed7', gid: 31 },
    { id: 10, type: 'table', floor: 0, x: -2.9, z: -1.65, rot: 0, y: 0, n: 'Meja', w: 1.2, d: 0.5, h: 0.75, c: '#3e1ed7', gid: 31 },
    { id: 12, type: 'table', floor: 0, x: -1.5, z: -1.7500000000000002, rot: 0, y: 0, n: 'Meja', w: 0.5, d: 0.5, h: 0.5, c: '#804040', gid: 30 },
    { id: 16, type: 'table', floor: 0, x: -0.375, z: -1.65, rot: 0, y: 0, n: 'Meja', w: 1.2, d: 0.5, h: 0.75, c: '#804040', gid: 7 },
    { id: 17, type: 'table', floor: 0, x: 0.825, z: -1.65, rot: 0, y: 0, n: 'Meja', w: 1.2, d: 0.5, h: 0.75, c: '#804040', gid: 7 },
    { id: 18, type: 'table', floor: 0, x: 2.025, z: -1.65, rot: 0, y: 0, n: 'Meja', w: 1.2, d: 0.5, h: 0.75, c: '#804040', gid: 7 },
    { id: 19, type: 'table', floor: 0, x: 3.225, z: -1.65, rot: 0, y: 0, n: 'Meja', w: 1.2, d: 0.5, h: 0.75, c: '#804040', gid: 7 },
    { id: 20, type: 'table', floor: 0, x: -5.6, z: -1.3, rot: 90, y: 0, n: 'Meja', w: 1.2, d: 0.5, h: 0.75, c: '#3e1ed7' },
    { id: 22, type: 'chair', floor: 0, x: -0.375, z: -1.4, rot: 180, y: 0, n: 'Kursi Kantor', w: 0.6, d: 0.6, h: 0.95, c: '#804040', gid: 7 },
    { id: 23, type: 'chair', floor: 0, x: 0.825, z: -1.4000000000000001, rot: 180, y: 0, n: 'Kursi Kantor', w: 0.6, d: 0.6, h: 0.95, c: '#804040', gid: 7 },
    { id: 24, type: 'chair', floor: 0, x: 2.025, z: -1.4000000000000001, rot: 180, y: 0, n: 'Kursi Kantor', w: 0.6, d: 0.6, h: 0.95, c: '#804040', gid: 7 },
    { id: 25, type: 'chair', floor: 0, x: 3.225, z: -1.4000000000000001, rot: 180, y: 0, n: 'Kursi Kantor', w: 0.6, d: 0.6, h: 0.95, c: '#804040', gid: 7 },
    { id: 26, type: 'sewing', floor: 0, x: -0.775, z: 1.725, rot: 0, y: 0, n: 'Mesin Jahit', w: 1.05, d: 0.55, h: 1.15, c: '#000000', gid: 8 },
    { id: 27, type: 'serger', floor: 0, x: 0.25, z: 1.725, rot: 0, y: 0, n: 'Mesin Obras', w: 1.05, d: 0.55, h: 1.4, c: '#8aa0b4', gid: 8 },
    { id: 28, type: 'table', floor: 0, x: 0.95, z: 0.9, rot: 270, y: 0, n: 'Meja', w: 1.2, d: 0.35, h: 0.8, c: '#a9774b', gid: 8 },
    { id: 29, type: 'table', floor: 0, x: -3, z: 0.75, rot: 0, y: 0, n: 'Meja', w: 1.6, d: 0.8, h: 0.75, c: '#808040', gid: 12 },
    { id: 30, type: 'table', floor: 0, x: -3, z: 1.5000000000000002, rot: 0, y: 0, n: 'Meja', w: 1.6, d: 0.8, h: 0.75, c: '#808040', gid: 12 },
    { id: 31, type: 'chair', floor: 0, x: -0.475, z: 1.5, rot: 0, y: 0, n: 'Kursi Kantor', w: 0.6, d: 0.6, h: 0.95, c: '#804000', gid: 8 },
    { id: 32, type: 'chair', floor: 0, x: -3, z: 0.4, rot: 0, y: 0, n: 'Kursi Kantor', w: 0.6, d: 0.6, h: 0.95, c: '#008000', gid: 12 },
    { id: 33, type: 'chair', floor: 0, x: -3.8, z: 1, rot: 90, y: 0, n: 'Kursi Kantor', w: 0.6, d: 0.6, h: 0.95, c: '#008000', gid: 12 },
    { id: 34, type: 'chair', floor: 0, x: -2.2, z: 1, rot: 270, y: 0, n: 'Kursi Kantor', w: 0.6, d: 0.6, h: 0.95, c: '#008000', gid: 12 },
    { id: 36, type: 'wall', floor: 1, x: 1.05, z: 0.06000000000000022, rot: 0, y: 0, n: 'Dinding Partisi', w: 2.5, d: 0.12, h: 1, c: '#804040', lk: 1 },
    { id: 37, type: 'shelf', floor: 1, x: -6.7, z: -0.19999999999999962, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 6, lk: 1, wmsCode: 'C001-C005' },
    { id: 38, type: 'shelf', floor: 1, x: -6.7, z: -1.4, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 6, lk: 1, wmsCode: 'C006-C010' },
    { id: 39, type: 'shelf', floor: 1, x: -6.2, z: -0.1999999999999994, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 6, lk: 1, wmsCode: 'C011-C015' },
    { id: 40, type: 'shelf', floor: 1, x: -6.2, z: -1.3999999999999997, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 6, lk: 1, wmsCode: 'C016-C020' },
    { id: 41, type: 'sewrack', floor: 0, x: 2.425, z: 0.55, rot: 180, y: 0, n: 'Rak Alat Jahit', w: 1, d: 0.5, h: 1.8, c: '#008080', lv: 5, tg: 'Rak Peralatan' },
    { id: 42, type: 'shelf', floor: 1, x: -2.95, z: -0.20000000000000095, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 9, lk: 1, wmsCode: 'C021-C025' },
    { id: 43, type: 'shelf', floor: 1, x: -2.95, z: -1.4000000000000012, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 9, lk: 1, wmsCode: 'C026-C030' },
    { id: 44, type: 'shelf', floor: 1, x: -2.45, z: -0.20000000000000073, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 9, lk: 1, wmsCode: 'C031-C035' },
    { id: 45, type: 'shelf', floor: 1, x: -2.45, z: -1.4000000000000012, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 9, lk: 1, wmsCode: 'C036-C040' },
    { id: 46, type: 'shelf', floor: 1, x: -5, z: -0.19999999999999996, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 10, lk: 1, wmsCode: 'C041-C045' },
    { id: 47, type: 'shelf', floor: 1, x: -5, z: -1.4000000000000001, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 10, lk: 1, wmsCode: 'C046-C050' },
    { id: 48, type: 'shelf', floor: 1, x: -4.5, z: -0.19999999999999973, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 10, lk: 1, wmsCode: 'C051-C055' },
    { id: 49, type: 'shelf', floor: 1, x: -4.5, z: -1.4000000000000001, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 10, lk: 1, wmsCode: 'C056-C060' },
    { id: 54, type: 'shelf', floor: 1, x: -6.7, z: 1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 16, lk: 1, wmsCode: 'D001-D005' },
    { id: 55, type: 'shelf', floor: 1, x: -5.7, z: 1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 16, lk: 1, wmsCode: 'D006-D010' },
    { id: 56, type: 'shelf', floor: 1, x: -4.7, z: 1.7500000000000002, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 16, lk: 1, wmsCode: 'D011-D015' },
    { id: 57, type: 'shelf', floor: 1, x: -3.7, z: 1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 16, lk: 1, wmsCode: 'D016-D020' },
    { id: 58, type: 'shelf', floor: 1, x: -2.7, z: 1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 16, lk: 1, wmsCode: 'D021-D025' },
    { id: 59, type: 'shelf', floor: 1, x: -1.7, z: 1.7500000000000002, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 16, lk: 1, wmsCode: 'D026-D030' },
    { id: 60, type: 'stairs', floor: 1, x: 2.4, z: 1.0600000000000003, rot: 0, y: 0, n: 'Tangga', w: 1.2, d: 2, h: 4, c: '#804040', mir: true, lk: 1 },
    { id: 61, type: 'table', floor: 1, x: 2.15, z: -0.7499999999999999, rot: 0, y: 0, n: 'Meja', w: 1.6, d: 0.8, h: 0.75, c: '#808040', gid: 13, lk: 1 },
    { id: 62, type: 'table', floor: 1, x: 2.15, z: 2.220446049250313e-16, rot: 0, y: 0, n: 'Meja', w: 1.6, d: 0.8, h: 0.75, c: '#808040', gid: 13, lk: 1 },
    { id: 63, type: 'chair', floor: 1, x: 2.15, z: -1.1, rot: 0, y: 0, n: 'Kursi Kantor', w: 0.6, d: 0.6, h: 0.95, c: '#008000', gid: 13, lk: 1 },
    { id: 64, type: 'chair', floor: 1, x: 1.35, z: -0.5, rot: 90, y: 0, n: 'Kursi Kantor', w: 0.6, d: 0.6, h: 0.95, c: '#008000', gid: 13, lk: 1 },
    { id: 65, type: 'chair', floor: 1, x: 2.95, z: -0.5, rot: 270, y: 0, n: 'Kursi Kantor', w: 0.6, d: 0.6, h: 0.95, c: '#008000', gid: 13, lk: 1 },
    { id: 71, type: 'sewrack', floor: 1, x: 7.199999999999999, z: -0.5, rot: 270, y: 0, n: 'Rak Alat Jahit', w: 0.9, d: 0.4, h: 1.8, c: '#d9d2c5', lv: 5, lk: 1 },
    { id: 72, type: 'shelf', floor: 1, x: -0.95, z: -0.2000000000000014, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 15, lk: 1, wmsCode: 'D031-D035' },
    { id: 73, type: 'shelf', floor: 1, x: -0.95, z: -1.4000000000000012, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 15, lk: 1, wmsCode: 'D036-D040' },
    { id: 74, type: 'shelf', floor: 1, x: -0.45, z: -0.20000000000000118, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 15, lk: 1, wmsCode: 'D041-D045' },
    { id: 75, type: 'shelf', floor: 1, x: -0.45, z: -1.4000000000000012, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 15, lk: 1, wmsCode: 'D046-D050' },
    { id: 76, type: 'shoerack', floor: 0, x: -7.45, z: -1.4000000000000001, rot: 90, y: 0, n: 'Rak Sepatu/Sandal', w: 1, d: 0.3, h: 1, c: '#8a6a4a', lv: 4 },
    { id: 77, type: 'shoerack', floor: 0, x: -6.47, z: -1.7000000000000002, rot: 180, y: 0, n: 'Rak Sepatu/Sandal', w: 1, d: 0.3, h: 1.5, c: '#8a6a4a', lv: 5 },
    { id: 79, type: 'stairs', floor: 0, x: 2.1, z: 1.0600000000000003, rot: 0, y: 0, n: 'Tangga', w: 1.2, d: 2, h: 4, c: '#804040', mir: true },
    { id: 80, type: 'stairs', floor: 2, x: 2.4, z: 1.0600000000000003, rot: 0, y: 0, n: 'Tangga', w: 1.2, d: 2, h: 4, c: '#804040', mir: true },
    { id: 81, type: 'shelf', floor: 2, x: -6.25, z: -1.4000000000000001, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 19, wmsCode: 'A001-A005' },
    { id: 82, type: 'shelf', floor: 2, x: -5.75, z: -1.4000000000000001, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 19, wmsCode: 'A006-A010' },
    { id: 83, type: 'shelf', floor: 2, x: -6.25, z: -0.2000000000000003, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 19, wmsCode: 'A011-A015' },
    { id: 84, type: 'shelf', floor: 2, x: -5.75, z: -0.2000000000000003, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 19, wmsCode: 'A016-A020' },
    { id: 85, type: 'shelf', floor: 2, x: -4.5, z: -1.4000000000000001, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 20, wmsCode: 'A021-A025' },
    { id: 86, type: 'shelf', floor: 2, x: -4, z: -1.4000000000000001, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 20, wmsCode: 'A026-A030' },
    { id: 87, type: 'shelf', floor: 2, x: -4.5, z: -0.20000000000000023, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 20, wmsCode: 'A031-A035' },
    { id: 88, type: 'shelf', floor: 2, x: -4, z: -0.20000000000000023, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 20, wmsCode: 'A036-A040' },
    { id: 89, type: 'shelf', floor: 2, x: -6.75, z: 1.8100000000000005, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 21, wmsCode: 'A041-A045' },
    { id: 90, type: 'shelf', floor: 2, x: -6.75, z: 1.8100000000000005, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 21, wmsCode: 'A046-A050' },
    { id: 91, type: 'shelf', floor: 2, x: -6.75, z: 1.8100000000000005, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 21, wmsCode: 'A051-A055' },
    { id: 92, type: 'shelf', floor: 2, x: -6.75, z: 1.8100000000000005, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 21, wmsCode: 'A056-A060' },
    { id: 93, type: 'shelf', floor: 2, x: -2.75, z: -1.4, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 22, wmsCode: 'A061-A065' },
    { id: 94, type: 'shelf', floor: 2, x: -2.25, z: -1.4, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 22, wmsCode: 'A066-A070' },
    { id: 95, type: 'shelf', floor: 2, x: -2.75, z: -0.2, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 22, wmsCode: 'A071-A075' },
    { id: 96, type: 'shelf', floor: 2, x: -2.25, z: -0.2, rot: 90, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 22, wmsCode: 'A076-A080' },
    { id: 97, type: 'shelf', floor: 2, x: -0.9, z: -1.55, rot: 90, y: 0, n: 'Rak Bertingkat', w: 0.9, d: 0.45, h: 2.2, c: '#c9a26b', lv: 5, wmsCode: 'A081-A085' },
    { id: 101, type: 'wall', floor: 3, x: 1.85, z: -0.6000000000000001, rot: 90, y: 0, n: 'Dinding Partisi', w: 2.9, d: 0.12, h: 4, c: '#e8e4dc', lk: 1 },
    { id: 102, type: 'shelf', floor: 3, x: -5.099999999999999, z: 1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, lk: 1, kl: true, wmsCode: 'R001-R010' },
    { id: 103, type: 'shelf', floor: 3, x: -2.7, z: 1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, lk: 1, kl: true, wmsCode: 'R011-R020' },
    { id: 104, type: 'shelf', floor: 3, x: -1.5000000000000002, z: 1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, lk: 1, kl: true, wmsCode: 'R021-R030' },
    { id: 105, type: 'shelf', floor: 3, x: -3.9, z: 1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, lk: 1, kl: true, wmsCode: 'R031-R040' },
    { id: 106, type: 'shelf', floor: 3, x: -0.30000000000000004, z: 1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, lk: 1, kl: true, wmsCode: 'R041-R050' },
    { id: 107, type: 'shelf', floor: 3, x: 1.54, z: 0.39999999999999986, rot: 90, y: 0, n: 'Rak Bertingkat', w: 0.9, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, kl: true, wmsCode: 'R051-R060' },
    { id: 108, type: 'door', floor: 3, x: 1.7899999999999996, z: -0.6, rot: 90, y: 0, n: 'Pintu', w: 0.9, d: 0.12, h: 2.1, c: '#7a5230', lk: 1 },
    { id: 112, type: 'wall', floor: 3, x: 3.9000000000000004, z: 0.7400000000000001, rot: 0, y: 0, n: 'Dinding Partisi', w: 4.1000000000000005, d: 0.12, h: 4, c: '#e8e4dc' },
    { id: 121, type: 'shelf', floor: 3, x: -2.8999999999999986, z: -1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, kl: true, lk: 1, wmsCode: 'V001-V015' },
    { id: 122, type: 'shelf', floor: 3, x: -1.6999999999999984, z: -1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, kl: true, lk: 1, wmsCode: 'V016-V030' },
    { id: 123, type: 'shelf', floor: 3, x: -3.9999999999999982, z: -1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, kl: true, lk: 1, wmsCode: 'V031-V045' },
    { id: 124, type: 'shelf', floor: 3, x: -5.099999999999999, z: -1.75, rot: 0, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, kl: true, lk: 1, wmsCode: 'V046-V060' },
    { id: 125, type: 'koli', floor: 3, x: -4.599999999999998, z: 0.04999999999999993, rot: 0, y: 0, n: 'Koli Baju', w: 0.6, d: 1.6, h: 1.2, c: '#008080', kw: 0.3, kd: 0.4, kh: 0.3, ny: 4, nz: 4, nx: 2, wmsCode: 'Z001-Z020' },
    { id: 126, type: 'koli', floor: 3, x: -3.5999999999999996, z: 0.04999999999999993, rot: 0, y: 0, n: 'Koli Baju', w: 0.6, d: 1.6, h: 1.2, c: '#ff8080', kw: 0.3, kd: 0.4, kh: 0.3, ny: 4, nz: 4, nx: 2, wmsCode: 'Z021-Z040' },
    { id: 127, type: 'koli', floor: 3, x: -2.4000000000000004, z: 0.04999999999999993, rot: 0, y: 0, n: 'Koli Baju', w: 0.6, d: 1.6, h: 1.2, c: '#8000ff', kw: 0.3, kd: 0.4, kh: 0.3, ny: 4, nz: 4, nx: 2, wmsCode: 'Z041-Z060' },
    { id: 132, type: 'shelf', floor: 2, x: -0.45, z: -1.55, rot: 90, y: 0, n: 'Rak Bertingkat', w: 0.9, d: 0.45, h: 2.2, c: '#c9a26b', lv: 5, wmsCode: 'B001-B005' },
    { id: 133, type: 'shelf', floor: 2, x: 0.55, z: -1.55, rot: 90, y: 0, n: 'Rak Bertingkat', w: 0.9, d: 0.45, h: 2.2, c: '#c9a26b', lv: 5, wmsCode: 'B006-B010' },
    { id: 134, type: 'shelf', floor: 2, x: 1, z: -1.55, rot: 90, y: 0, n: 'Rak Bertingkat', w: 0.9, d: 0.45, h: 2.2, c: '#c9a26b', lv: 5, wmsCode: 'B011-B015' },
    { id: 135, type: 'shelf', floor: 2, x: 2.05, z: -1.55, rot: 90, y: 0, n: 'Rak Bertingkat', w: 0.9, d: 0.45, h: 2.2, c: '#c9a26b', lv: 5, wmsCode: 'B016-B020' },
    { id: 136, type: 'shelf', floor: 2, x: 2.5, z: -1.55, rot: 90, y: 0, n: 'Rak Bertingkat', w: 0.9, d: 0.45, h: 2.2, c: '#c9a26b', lv: 5, wmsCode: 'B021-B025' },
    { id: 137, type: 'shelf', floor: 2, x: 3.5, z: -1.5500000000000003, rot: 90, y: 0, n: 'Rak Bertingkat', w: 0.9, d: 0.45, h: 2.2, c: '#c9a26b', lv: 5, wmsCode: 'B026-B030' },
    { id: 138, type: 'shelf', floor: 2, x: 3.95, z: -1.5500000000000003, rot: 90, y: 0, n: 'Rak Bertingkat', w: 0.9, d: 0.45, h: 2.2, c: '#c9a26b', lv: 5, wmsCode: 'B031-B035' },
    { id: 139, type: 'shelf', floor: 2, x: 2.65, z: 0.5, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 27, wmsCode: 'B036-B040' },
    { id: 140, type: 'shelf', floor: 2, x: 2.65, z: 0.5, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 27, wmsCode: 'B041-B045' },
    { id: 141, type: 'shelf', floor: 2, x: 2.65, z: 0.5, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 27, wmsCode: 'B046-B050' },
    { id: 142, type: 'shelf', floor: 2, x: 2.65, z: 0.5, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 27, wmsCode: 'B051-B055' },
    { id: 143, type: 'shelf', floor: 2, x: 1.375, z: 0.5, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 28, wmsCode: 'B056-B060' },
    { id: 144, type: 'shelf', floor: 2, x: 1.375, z: 0.5, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 28, wmsCode: 'B061-B065' },
    { id: 145, type: 'shelf', floor: 2, x: 1.375, z: 0.5, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 28, wmsCode: 'B066-B070' },
    { id: 146, type: 'shelf', floor: 2, x: 1.375, z: 0.5, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 28, wmsCode: 'B071-B075' },
    { id: 147, type: 'shelf', floor: 2, x: -5.6499999999999995, z: 1.8100000000000007, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 29, wmsCode: 'A086-A090' },
    { id: 148, type: 'shelf', floor: 2, x: -5.6499999999999995, z: 1.8100000000000007, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 29, wmsCode: 'A091-A095' },
    { id: 149, type: 'shelf', floor: 2, x: -5.6499999999999995, z: 1.8100000000000007, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 29, wmsCode: 'A096-A100' },
    { id: 150, type: 'shelf', floor: 2, x: -5.6499999999999995, z: 1.8100000000000007, rot: 180, y: 0, n: 'Rak Bertingkat', w: 1.2, d: 0.5, h: 2.2, c: '#c9a26b', lv: 5, gid: 29, wmsCode: 'B076-B080' },
    { id: 151, type: 'zone', floor: 2, x: -3.15, z: 0.8500000000000001, rot: 0, y: 0, n: 'Section A - DRESS', w: 2.8000000000000003, d: 0.7000000000000001, h: 0.02, c: '#3b82f6', tg: '' },
    { id: 152, type: 'zone', floor: 2, x: 1.375, z: -0.5500000000000003, rot: 0, y: 0, n: 'Section B - BOTTOM', w: 2.8000000000000003, d: 0.7000000000000001, h: 0.02, c: '#3b82f6', tg: '' },
    { id: 153, type: 'laptop', floor: 0, x: -0.4, z: -1.7000000000000002, rot: 0, y: 0.75, n: 'Laptop', w: 0.34, d: 0.24, h: 0.22, c: '#9aa3ad' },
    { id: 154, type: 'laptop', floor: 0, x: 0.65, z: -1.6500000000000001, rot: 0, y: 0.75, n: 'Laptop', w: 0.34, d: 0.24, h: 0.22, c: '#9aa3ad' },
    { id: 155, type: 'laptop', floor: 0, x: 2, z: -1.6, rot: 0, y: 0.75, n: 'Laptop', w: 0.34, d: 0.24, h: 0.22, c: '#9aa3ad' },
    { id: 156, type: 'laptop', floor: 0, x: 3.15, z: -1.6500000000000001, rot: 0, y: 0.75, n: 'Laptop', w: 0.34, d: 0.24, h: 0.22, c: '#9aa3ad' },
    { id: 157, type: 'printer', floor: 0, x: -1.5, z: -1.8, rot: 0, y: 0.5, n: 'Printer', w: 0.45, d: 0.38, h: 0.25, c: '#f0f0f0', gid: 30 },
    { id: 158, type: 'bath', floor: 0, x: 5.45, z: 0.75, rot: 0, y: 0, n: 'Kamar Mandi', w: 2.5, d: 2.5, h: 2.8, c: '#cfd2d4' },
    { id: 159, type: 'wall', floor: 0, x: 6.64, z: -1.2650000000000001, rot: 90, y: 0, n: 'Dinding Partisi', w: 1.55, d: 0.12, h: 2.8000000000000003, c: '#e8e4dc', dr: 1 },
    { id: 160, type: 'bath', floor: 2, x: 6, z: 1, rot: 0, y: 0, n: 'Kamar Mandi', w: 3, d: 2, h: 2.8, c: '#cfd2d4' },
    { id: 161, type: 'wall', floor: 1, x: 6.1, z: -1.15, rot: 0, y: 0, n: 'Dinding Partisi', w: 2.6, d: 0.12, h: 1, c: '#e8e4dc', lk: 1 },
    { id: 162, type: 'wall', floor: 1, x: 4.86, z: -1.55, rot: 90, y: 0, n: 'Dinding Partisi', w: 0.8999999999999996, d: 0.12, h: 1, c: '#e8e4dc', lk: 1 },
    { id: 163, type: 'bath', floor: 1, x: 6, z: 1, rot: 0, y: 0, n: 'Kamar Mandi', w: 3, d: 2, h: 2.8, c: '#cfd2d4', lk: 1 },
  ],
  cur: 2,
  sel: null,
  uid: 164,
  all: false,
  walls: true,
  cl: true,
  snap: 0.05,
  ms: [],
  gid: 32,
  v2: 1,
  th: 'dark',
  mg: true,
};

function buildWarehouse3DHtml(seedInput: any): string {
  const seedObj = typeof seedInput === 'string' ? JSON.parse(seedInput) : seedInput;
  const safeSeed = JSON.stringify(seedObj).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="id" data-theme="dark" style="color-scheme: dark;"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Perancang Gudang 3D — WMS Capacity Live</title>
<style>
:root{--bg:#f4f1ec;--pn:#fff;--tx:#2b2620;--mu:#7a7165;--ac:#4f46e5;--bd:#ddd5c9;--inp:#faf8f5;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#0f172a;--pn:#131d31;--tx:#f1f5f9;--mu:#94a3b8;--ac:#6366f1;--bd:#1e293b;--inp:#0b1324}}
:root[data-theme="light"]{color-scheme:light}
:root[data-theme="dark"]{color-scheme:dark;--bg:#0f172a;--pn:#131d31;--tx:#f1f5f9;--mu:#94a3b8;--ac:#6366f1;--bd:#1e293b;--inp:#0b1324}
html,body{height:100%;margin:0}body{font:12.5px system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--tx)}
#app{display:flex;height:100%}#side{width:315px;overflow:auto;background:var(--pn);border-right:1px solid var(--bd);padding:12px;box-sizing:border-box}
#view{flex:1;position:relative;min-width:0}canvas{display:block;width:100%;height:100%;touch-action:none}
h1{font-size:15px;margin:0 0 4px;font-weight:800}h3{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mu);margin:14px 0 6px;font-weight:800}
button,input,select{font:inherit;color:var(--tx);background:var(--inp);border:1px solid var(--bd);border-radius:7px;padding:5px 8px;box-sizing:border-box;transition:border-color .15s}
button{cursor:pointer;font-weight:600}button:hover{border-color:var(--ac)}button.dn{color:#ef4444}
input[type=color]{padding:0;height:28px;width:100%}input[type=number],input:not([type]),select{width:100%}
label{display:flex;flex-direction:column;gap:2px;color:var(--mu);font-size:11px}.chk{flex-direction:row;align-items:center;gap:6px;color:var(--tx);font-size:12.5px;margin:3px 0}.chk input{width:auto}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:6px}.full{grid-column:1/3;margin-bottom:6px}.row{display:flex;gap:6px;margin-top:8px}.row button{flex:1}
.pal{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.fr{display:grid;grid-template-columns:62px 1fr 1fr 1fr;gap:4px;align-items:end;padding:6px;border:1px solid var(--bd);border-radius:8px;margin-bottom:5px}.fr.on{border-color:var(--ac);background:color-mix(in srgb,var(--ac) 10%,transparent)}
.fr b{cursor:pointer;grid-row:1/3;align-self:center}.fr span{grid-column:2/5;font-size:11px;color:var(--ac);font-weight:700}
.fx2{grid-column:1/5;display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px}.fx2 button{font-size:11px}
.fx{grid-column:1/5;display:grid;grid-template-columns:1.2fr .7fr 1fr;gap:4px;align-items:end;margin-top:2px}
.mu{color:var(--mu)}#chips,#cams{position:absolute;display:flex;gap:6px;top:10px}#chips{left:10px;flex-wrap:wrap}#cams{right:10px;flex-wrap:wrap;justify-content:flex-end;max-width:65%}#cams button.on{background:var(--ac);color:#fff;border-color:var(--ac)}
#chips button,#cams button{box-shadow:0 2px 6px rgba(0,0,0,.22)}#chips button.on{background:var(--ac);color:#fff;border-color:var(--ac)}
#ic{position:absolute;right:10px;bottom:10px;width:min(330px,calc(100% - 20px));box-sizing:border-box;background:color-mix(in srgb,var(--pn) 95%,transparent);color:var(--tx);border:1px solid var(--bd);border-radius:12px;padding:11px 13px;box-shadow:0 8px 24px rgba(0,0,0,.28);display:none;backdrop-filter:blur(8px);font-size:12px;line-height:1.45}
.ict{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13.5px}.icd{width:10px;height:10px;border-radius:50%;flex:none}.ics{color:var(--mu);font-size:11px;margin:2px 0 6px}.icb{margin-bottom:8px;max-height:140px;overflow:auto}.icm{display:flex;flex-wrap:wrap;gap:5px}.icm span{background:color-mix(in srgb,var(--ac) 14%,transparent);border-radius:999px;padding:2px 8px;font-size:10.5px;font-family:monospace;font-weight:700}
.wms-box{background:color-mix(in srgb,var(--inp) 90%,transparent);border:1px solid var(--bd);border-radius:8px;padding:8px;margin:6px 0}
.wms-bar{height:7px;border-radius:999px;background:rgba(148,163,184,.2);overflow:hidden;margin:5px 0}
.wms-bar-fill{height:100%;border-radius:999px;transition:width .25s}
.ta2{font:12.5px system-ui,sans-serif;height:56px;resize:vertical}
.tgi{cursor:pointer;padding:4px 0;border-bottom:1px solid var(--bd);color:var(--tx);display:flex;justify-content:space-between;align-items:center}.tgi:hover{color:var(--ac)}
#gd{position:absolute;left:10px;bottom:34px;font-size:11px;color:var(--tx);background:color-mix(in srgb,var(--pn) 92%,transparent);padding:4px 9px;border-radius:6px;display:none;max-width:85%;border:1px solid var(--bd)}
#hint{position:absolute;left:10px;bottom:8px;font-size:10.5px;color:var(--mu);background:color-mix(in srgb,var(--pn) 80%,transparent);padding:3px 8px;border-radius:6px}
textarea{width:100%;height:60px;font:11px monospace;background:var(--inp);color:var(--tx);border:1px solid var(--bd);border-radius:6px;box-sizing:border-box}
@media(max-width:800px){#app{flex-direction:column}#view{flex:none;height:54%}#side{width:auto;flex:1;border-right:0;border-top:1px solid var(--bd)}#hint{display:none}}
</style></head><body>
<div id="app"><div id="side">
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px"><div><h1 style="margin:0 0 2px">Perancang Gudang 3D</h1><div class="mu">Satuan meter. Terhubung ke kapasitas Rak WMS.</div></div><button id="btn-side-close" onclick="tgSide(false)" title="Sembunyikan Panel Desain (Tekan H)" style="padding:4px 8px;font-size:11px;shrink:0;cursor:pointer;white-space:nowrap;background:var(--inp);border:1px solid var(--bd)">◀ Sembunyikan</button></div>
<h3>Lantai &amp; luas area (P × L × T)</h3><div id="fl-ed"></div>
<div class="row"><button onclick="addF()">+ Lantai</button><button onclick="delF()">− Lantai terakhir</button></div><div id="tot" class="mu" style="margin-top:6px"></div>
<label style="margin-top:8px">Saat ubah panjang (P): sisi yang tetap<select id="al"><option value="left">Kiri tetap (tambah ke kanan)</option><option value="center">Tengah (dua sisi)</option><option value="right">Kanan tetap (tambah ke kiri)</option></select></label>
<label style="margin-top:6px">Saat ubah lebar (L): sisi yang tetap<select id="aw"><option value="back">Belakang tetap (tambah ke depan)</option><option value="center">Tengah (dua sisi)</option><option value="front">Depan tetap (tambah ke belakang)</option></select></label>
<h3>Tampilan &amp; Kapasitas WMS</h3>
<label class="chk"><input type="checkbox" id="ck-hm">🔥 Mode Heatmap Kapasitas Live WMS</label>
<label class="chk"><input type="checkbox" id="ck-wtag" checked="">🏷️ Label Kode Rak &amp; % Kapasitas di 3D</label>
<label class="chk"><input type="checkbox" id="ck-all">Tampilkan semua lantai sekaligus</label>
<label class="chk"><input type="checkbox" id="ck-wall" checked="">Dinding luar gedung</label>
<label class="chk"><input type="checkbox" id="ck-cl" checked="">Isi pakaian / koli di rak</label>
<label class="chk"><input type="checkbox" id="ck-mg" checked="">Magnet &amp; garis bantu (Alt = bebas)</label>
<label class="chk"><input type="checkbox" id="ck-tg" checked="">Tampilkan penanda 3D</label>
<label class="chk"><input type="checkbox" id="ck-fh" checked="">Pegangan tarik area lantai</label>
<div class="row"><button onclick="lockFloor(true)">Kunci lantai ini</button><button onclick="lockFloor(false)">Buka kunci lantai ini</button></div>
<label style="margin-top:6px">Snap geser<select id="sn"><option value="0">Bebas</option><option value="0.01">1 cm</option><option value="0.05">5 cm</option><option value="0.1">10 cm</option><option value="0.25">25 cm</option><option value="0.5">50 cm</option></select></label>
<h3>Tambah aset ke lantai aktif</h3><div class="pal" id="pal"></div>
<h3>Properti aset &amp; Kode Rak WMS</h3><div id="pp"><p class="mu">Klik rak/aset di 3D untuk mengedit ukuran, kode rak WMS, warna, dan melihat stok real-time.</p></div>
<h3>Ringkasan Aset &amp; Kapasitas</h3><div id="sm" class="mu"></div>
<h3>Daftar Rak WMS &amp; Penanda</h3><div id="tgl" class="mu"></div>
<h3>Unduh &amp; buka file</h3><div class="pal"><button onclick="dlJson()">Data (.json)</button><button onclick="dlHtml()">Aplikasi + data (.html)</button><button onclick="dlPng()">Gambar 3D (.png)</button><button onclick="dlCsv()">Daftar aset (.csv)</button></div><div class="row"><button onclick="$('fi').click()">Buka file data (.json)</button></div><input type="file" id="fi" accept=".json,application/json" style="display:none">
<h3>Ekspor / impor teks</h3><textarea id="ta" placeholder="Data layout (JSON)"></textarea><div class="row"><button id="ex">Ekspor</button><button id="im">Muat</button></div>
</div>
<div id="view"><canvas id="cv"></canvas><div id="chips"></div><div id="cams"><button id="btn-cams-side" onclick="tgSide()" title="Sembunyikan / Buka Panel Desain (Tekan H)">📐 Panel</button><button id="bhm" onclick="tgHeatmap()">🔥 Heatmap Live</button><button onclick="cm(0)">3D</button><button onclick="cm(1)">Atas</button><button onclick="cm(2)">Fokus lantai</button><button onclick="undo()">Undo</button><button onclick="redo()">Redo</button><button id="bm" onclick="tgM()">Multi</button><button onclick="selAll()">Pilih semua</button><button id="bt" onclick="cycTheme()">Tema: Gelap</button></div><div id="ic"></div><div id="gd"></div><div id="hint">Seret = pindah (magnet + garis bantu, Alt = bebas) · Klik Rak = Lihat Kapasitas &amp; Stok Real-Time WMS · H = Sembunyikan/Buka Panel · Tarik kotak warna = ubah ukuran · L kunci · R putar · Del hapus</div></div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/BufferGeometryUtils.js"></script>
<script>window.__SEED=${safeSeed};</script>
<script>
const T=THREE,$=i=>document.getElementById(i),esc=s=>String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;');
const D={rack:{n:'Rak Gantung',w:1.8,d:.6,h:1.7,c:'#8d939a'},shelf:{n:'Rak Bertingkat',w:1.2,d:.5,h:2.2,c:'#c9a26b',lv:5},table:{n:'Meja',w:1.6,d:.8,h:.75,c:'#a9774b'},wall:{n:'Dinding Partisi',w:3,d:.12,h:2.6,c:'#e8e4dc'},window:{n:'Jendela',w:1.5,d:.12,h:1.2,c:'#3d3d3d',y:1},door:{n:'Pintu',w:.9,d:.12,h:2.1,c:'#7a5230'},bench:{n:'Bangku',w:1.4,d:.4,h:.45,c:'#6d4c2f'},stairs:{n:'Tangga L',w:1.2,d:3.5,h:4,c:'#b9b2a6',s2:3,hl:1},room:{n:'Ruangan Tambahan',w:4,d:3,h:2.8,c:'#cfd2d4'},bath:{n:'Kamar Mandi',w:2.5,d:2.5,h:2.8,c:'#cfd2d4'},laptop:{n:'Laptop',w:.34,d:.24,h:.22,c:'#9aa3ad'},printer:{n:'Printer',w:.45,d:.38,h:.25,c:'#f0f0f0'},koli:{n:'Koli Baju',w:.3,d:.4,h:.3,c:'#9fb8d6'},shoerack:{n:'Rak Sepatu/Sandal',w:1,d:.3,h:1,c:'#8a6a4a',lv:4},sewrack:{n:'Rak Alat Jahit',w:1.2,d:.4,h:1.8,c:'#d9d2c5',lv:5},chair:{n:'Kursi Kantor',w:.6,d:.6,h:.95,c:'#2f3a4a'},sewing:{n:'Mesin Jahit',w:1.05,d:.55,h:1.15,c:'#cfd6dc'},serger:{n:'Mesin Obras',w:1.05,d:.55,h:1.4,c:'#8aa0b4'},zone:{n:'Zona QC',w:4,d:3,h:.02,c:'#3b82f6'}};
const ZN=['Zona Inbound','Zona QC','Lolos QC','Reject / Defect','Perbaikan','Ready Jual','Packing Order Online','Area Live','Photoshoot','Tarikan Store','Kirim Store','Section A - DRESS','Section B - BOTTOM'];
const TGS=['Meja QC','Meja Packing','Meja Jahit','Meja Photoshoot','Rak Storage','Rak Inbound','Rak Ready Jual','Rak Reject/Defect','Rak Perbaikan','Rak Live','Area Retur'];

// Live WMS Capacity Store injected from React parent
let WMS_SLOTS = {};
let WMS_HEATMAP = false;
let WMS_SHOW_RACK_TAGS = true;

function expandWmsCodes(codeStr) {
  if (!codeStr) return [];
  const raw = String(codeStr).toUpperCase().trim();
  if (!raw) return [];
  const out = [];
  raw.split(/[,;\\s]+/).forEach(part => {
    if (!part) return;
    const m = part.match(/^([A-Z]+)(\\d+)-([A-Z]+)?(\\d+)$/);
    if (m) {
      const pref = m[1];
      const start = parseInt(m[2], 10);
      const end = parseInt(m[4], 10);
      const pad = m[2].length;
      if (!isNaN(start) && !isNaN(end) && end >= start && (end - start) <= 200) {
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

function getObjWmsStats(o) {
  const code = o.wmsCode || '';
  const codes = expandWmsCodes(code);
  if (!codes.length) return null;
  let curQty = 0, maxCap = 0, skuCount = 0;
  const matched = [];
  codes.forEach(c => {
    const slot = WMS_SLOTS[c];
    if (slot) {
      curQty += (Number(slot.currentQty) || 0);
      maxCap += (Number(slot.maxCapacity) || 25);
      skuCount += (Number(slot.skuCount) || 0);
      matched.push(slot);
    } else {
      maxCap += 25;
    }
  });
  const pct = maxCap > 0 ? Math.round((curQty / maxCap) * 100) : 0;
  let status = 'EMPTY', col = '#64748b';
  if (curQty > 0) {
    if (pct > 100) { status = 'OVERLOAD'; col = '#e11d48'; }
    else if (pct >= 100) { status = 'FULL'; col = '#ef4444'; }
    else if (pct >= 80) { status = 'WARNING'; col = '#f59e0b'; }
    else { status = 'SAFE'; col = '#10b981'; }
  }
  return { code, codes, curQty, maxCap, pct, skuCount, status, col, matched };
}

function autoMapWmsCodesToObjs(objs) {
  let aIdx = 1, bIdx = 1, cIdx = 1, dIdx = 1, rIdx = 1, vIdx = 1, zIdx = 1;
  objs.forEach(o => {
    if (o.wmsCode) return;
    if (o.type === 'shelf' || o.type === 'rack') {
      if (o.floor === 0) {
        o.wmsCode = aIdx === 1 ? 'STUDIO' : 'SHOPEE,TIKTOK';
        aIdx++;
      } else if (o.floor === 1) {
        if (o.z < 0.5) {
          const s = cIdx, e = cIdx + 4; cIdx += 5;
          o.wmsCode = 'C' + String(s).padStart(3,'0') + '-C' + String(e).padStart(3,'0');
        } else {
          const s = dIdx, e = dIdx + 4; dIdx += 5;
          o.wmsCode = 'D' + String(s).padStart(3,'0') + '-D' + String(e).padStart(3,'0');
        }
      } else if (o.floor === 2) {
        if (o.x < -0.6) {
          const s = aIdx, e = aIdx + 4; aIdx += 5;
          o.wmsCode = 'A' + String(s).padStart(3,'0') + '-A' + String(e).padStart(3,'0');
        } else {
          const s = bIdx, e = bIdx + 4; bIdx += 5;
          o.wmsCode = 'B' + String(s).padStart(3,'0') + '-B' + String(e).padStart(3,'0');
        }
      } else if (o.floor === 3) {
        if (o.z >= 0) {
          const s = rIdx, e = rIdx + 9; rIdx += 10;
          o.wmsCode = 'R' + String(s).padStart(3,'0') + '-R' + String(e).padStart(3,'0');
        } else {
          const s = vIdx, e = vIdx + 14; vIdx += 15;
          o.wmsCode = 'V' + String(s).padStart(3,'0') + '-V' + String(e).padStart(3,'0');
        }
      }
    } else if (o.type === 'koli' && o.floor === 3) {
      const s = zIdx, e = zIdx + 19; zIdx += 20;
      o.wmsCode = 'Z' + String(s).padStart(3,'0') + '-Z' + String(e).padStart(3,'0');
    }
  });
}

function getInitialSeed(){
  try{
    let s=window.__SEED;
    if(typeof s==='string')s=JSON.parse(s);
    if(s&&Array.isArray(s.floors)&&Array.isArray(s.objs)&&s.objs.length>0)return s;
  }catch(e){}
  return {floors:[{L:16.6,W:4,H:4,fc:'#808040'},{L:15,W:4,H:4,fc:'#7a5230',ox:-0.8,oz:0,lk:1},{L:15,W:4,H:4,fc:'#bdb8b0',ox:-0.8,oz:0},{L:12,W:4,H:4,fc:'#bdb8b0'}],objs:[],cur:2,sel:null,uid:164,all:false,walls:true,cl:true,snap:0.05,ms:[],gid:32,v2:1,th:'dark',mg:true};
}
const initSeed=getInitialSeed();
let S=JSON.parse(JSON.stringify(initSeed));
let j0=null;
try{
  const stored=localStorage.getItem('${LOCAL_STORAGE_3D_KEY}');
  if(stored){
    const p=JSON.parse(stored);
    if(p&&Array.isArray(p.floors)&&Array.isArray(p.objs)&&p.objs.length>=10){
      j0=p;
    }
  }
}catch(e){}
try{if(j0)S=Object.assign(S,j0)}catch(e){}
autoMapWmsCodesToObjs(S.objs || []);
S.sel=null;S.ms=[];S.gid=S.gid||1;if(!S.v2){S.snap=0.05;S.v2=1}S.th=S.th||'dark';if(S.cur>=S.floors.length)S.cur=0;
const persist=()=>{
  try{
    const str = JSON.stringify(S);
    localStorage.setItem('${LOCAL_STORAGE_3D_KEY}',str);
    window.parent.postMessage({type:'WMS_3D_STATE_CHANGED',payload:str},'*');
  }catch(e){}
};
let H=[],hi=-1,hT=0,hK=null;
const snapJ=()=>JSON.stringify({floors:S.floors,objs:S.objs,uid:S.uid,gid:S.gid});
function pushH(key){const j=snapJ();if(H[hi]===j)return;const now=Date.now();H=H.slice(0,hi+1);if(key&&key===hK&&now-hT<1500&&hi>0)H[hi]=j;else{H.push(j);if(H.length>100)H.shift();hi=H.length-1}hT=now;hK=key}
const save=key=>{persist();pushH(key)};
function applyH(j){const s=JSON.parse(j);S.floors=s.floors;S.objs=s.objs;S.uid=Math.max(S.uid,s.uid);S.gid=Math.max(S.gid||1,s.gid||1);if(S.cur>=S.floors.length)S.cur=S.floors.length-1;S.ms=S.ms.filter(id=>S.objs.some(o=>o.id===id));S.sel=S.ms.length?S.ms[S.ms.length-1]:null;buildB();renderObjs();drawFloors();drawP();persist()}
function undo(){if(hi>0){hi--;hK=null;applyH(H[hi])}}
function redo(){if(hi<H.length-1){hi++;hK=null;applyH(H[hi])}}
const elev=i=>S.floors.slice(0,i).reduce((a,f)=>a+f.H,0),cur=()=>S.objs.find(o=>o.id===S.sel);
// scene
const cv=$('cv'),R=new T.WebGLRenderer({canvas:cv,antialias:true});R.shadowMap.enabled=true;R.shadowMap.type=T.PCFSoftShadowMap;R.shadowMap.autoUpdate=false;R.toneMapping=T.ACESFilmicToneMapping;R.outputEncoding=T.sRGBEncoding;R.setPixelRatio(Math.min(devicePixelRatio,1.5));
const sc=new T.Scene();sc.background=new T.Color(0xdde5ea);sc.fog=new T.Fog(0xdde5ea,90,220);
const cam=new T.PerspectiveCamera(50,1,.1,500),oc=new T.OrbitControls(cam,cv);oc.maxPolarAngle=Math.PI*.495;oc.enableDamping=true;let dirty=1;const inv=()=>{dirty=1;R.shadowMap.needsUpdate=true};oc.addEventListener('change',()=>{dirty=1});
const hemi=new T.HemisphereLight(0xffffff,0x998f80,.85);sc.add(hemi);
const sun=new T.DirectionalLight(0xfff2de,1.1);sun.position.set(25,45,20);sun.castShadow=true;const msz=matchMedia('(pointer:coarse)').matches?1024:2048;sun.shadow.mapSize.set(msz,msz);const shc=sun.shadow.camera;shc.left=shc.bottom=-40;shc.right=shc.top=40;shc.far=150;sun.shadow.bias=-.0005;sc.add(sun);
const gnd=new T.Mesh(new T.PlaneGeometry(600,600),new T.MeshStandardMaterial({color:0xb9c2a8,roughness:1}));gnd.rotation.x=-Math.PI/2;gnd.position.y=-.25;gnd.receiveShadow=true;sc.add(gnd);
let BG=new T.Group(),OG=new T.Group(),BH=null,BHs=[],TG=new T.Group(),HG=new T.Group(),FH=new T.Group();sc.add(TG,HG,FH);sc.add(BG,OG);
const disp=g=>g.traverse(o=>{o.geometry&&o.geometry.dispose();if(o.material){const m=o.material;if(m.map)m.map.dispose();m.dispose&&m.dispose()}});
const FR={keramik:.35,beton:.9,kayu:.6,epoxy:.25},TC={};
function floorTex(f){const ty=f.ft||'keramik',col=f.fc||'#bdb8b0',k=ty+col;
 if(!TC[k]){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle=col;x.fillRect(0,0,256,256);
  for(let i=0;i<3500&&ty!=='epoxy';i++){x.fillStyle=\`rgba(\${Math.random()<.5?'0,0,0':'255,255,255'},\${Math.random()*.07})\`;x.fillRect(Math.random()*256,Math.random()*256,2,2)}
  if(ty==='kayu'){x.strokeStyle='rgba(0,0,0,.4)';x.lineWidth=2;for(let i=0;i<4;i++){for(let j=0;j<12;j++){x.fillStyle='rgba(0,0,0,.06)';x.fillRect(Math.random()*256,i*64+Math.random()*64,40+Math.random()*120,1.5)}x.strokeRect(0,i*64,256,64);x.beginPath();x.moveTo((i*97)%256,i*64);x.lineTo((i*97)%256,i*64+64);x.stroke()}}
  else{x.strokeStyle=ty==='keramik'?'rgba(70,64,58,.6)':ty==='beton'?'rgba(0,0,0,.2)':'rgba(0,0,0,0)';x.lineWidth=ty==='keramik'?3:2;x.strokeRect(1,1,254,254)}
  const t0=new T.CanvasTexture(c);t0.wrapS=t0.wrapT=T.RepeatWrapping;t0.anisotropy=8;TC[k]=t0}
 const t=TC[k].clone(),s=Math.max(.1,f.fs||.6);t.needsUpdate=true;t.repeat.set(f.L/s,f.W/s);return t}
const fo=i=>{const f=S.floors[i];return{x:f?(+f.ox||0):0,z:f?(+f.oz||0):0}};
let SSig='';
const ssig=()=>JSON.stringify([S.floors.map(f=>[f.ox||0,f.oz||0]),S.objs.filter(o=>o.type==='stairs').map(o=>[o.floor,o.x,o.z,o.w,o.d,o.h,o.s2,o.hl,o.rot,o.mir])]);
function slabGeo(f,i){const sh=new T.Shape();sh.moveTo(-f.L/2,-f.W/2);sh.lineTo(f.L/2,-f.W/2);sh.lineTo(f.L/2,f.W/2);sh.lineTo(-f.L/2,f.W/2);sh.closePath();
 if(i>0)S.objs.forEach(o=>{if(o.type!=='stairs'||o.floor!==i-1)return;const w=o.w,L2=Math.max(.5,+o.s2||3),d=o.d,L1=Math.max(.3,d-w),hl=Math.min(Math.max(.3,+o.hl||1),o.h*.8),n2=Math.max(2,Math.round((o.h-hl)/.18)),x0=-(w+L2)/2,zc=-d/2+L1+w/2,xa=x0+w,xb=x0+w+L2-L2/n2,a=(+o.rot||0)*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),cl=(v,m)=>Math.max(-m/2+.01,Math.min(m/2-.01,v));
  const pt=[[xa,zc-w/2],[xb,zc-w/2],[xb,zc+w/2],[xa,zc+w/2]].map(p=>{const lx=o.mir?-p[0]:p[0],lz=p[1];const od=fo(i-1),oi=fo(i);return[cl(o.x+lx*cs+lz*sn+od.x-oi.x,f.L),cl(o.z-lx*sn+lz*cs+od.z-oi.z,f.W)]});
  const hp=new T.Path();hp.moveTo(pt[0][0],pt[0][1]);for(let k=1;k<4;k++)hp.lineTo(pt[k][0],pt[k][1]);hp.closePath();sh.holes.push(hp)});
 const g=new T.ExtrudeGeometry(sh,{depth:.2,bevelEnabled:false});g.rotateX(Math.PI/2);return g}
function buildB(){if(fz)dirty=1;else inv();SSig=ssig();
 sc.remove(BG);disp(BG);BG=new T.Group();sc.add(BG);
 S.floors.forEach((f,i)=>{if(!S.all&&i>S.cur)return;const e=elev(i),t=floorTex(f);
  const sl=new T.Mesh(slabGeo(f,i),new T.MeshStandardMaterial({map:t,roughness:FR[f.ft||'keramik']}));t.repeat.set(1/Math.max(.1,f.fs||.6),1/Math.max(.1,f.fs||.6));sl.position.set(fo(i).x,e,fo(i).z);sl.receiveShadow=sl.castShadow=true;BG.add(sl);
  if(S.walls){const wm=new T.MeshStandardMaterial({color:0xf2efe9,transparent:true,opacity:i===S.cur?.16:.32,roughness:.9,depthWrite:false,side:T.DoubleSide});
   [[f.L,.2,0,-f.W/2],[f.L,.2,0,f.W/2],[.2,f.W,-f.L/2,0],[.2,f.W,f.L/2,0]].forEach(a=>{const gm=new T.BoxGeometry(a[0],f.H,a[1]),m=new T.Mesh(gm,wm);m.position.set(a[2]+fo(i).x,e+f.H/2,a[3]+fo(i).z);BG.add(m);const l=new T.LineSegments(new T.EdgesGeometry(gm),new T.LineBasicMaterial({color:0x6b6358}));l.position.copy(m.position);BG.add(l)})}});
 const f=S.floors[S.cur],gr=new T.GridHelper(Math.max(f.L,f.W),Math.max(f.L,f.W),0x555555,0x999999);gr.material.transparent=true;gr.material.opacity=.25;gr.position.set(fo(S.cur).x,elev(S.cur)+.01,fo(S.cur).z);BG.add(gr);
}
// aset
const PAL=['#e8b4b8','#f4e4d4','#9fb8d6','#c8d5b9','#f2d16b','#d9a5c7','#4a4a4a','#fafafa','#c2574f','#7ba7a5'];
function bxm(g,w,h,d,c,x,y,z,o){const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial(Object.assign({color:c,roughness:.7},o||{})));m.position.set(x,y+h/2,z);m.castShadow=m.receiveShadow=true;g.add(m);return m}
const colC={};
function bx(g,w,h,d,c,x,y,z,o){o=o||{};const a=g.userData.acc||(g.userData.acc={}),k=(o.roughness==null?.7:o.roughness)+'|'+(o.metalness||0)+'|'+(o.opacity==null?1:o.opacity),ge=new T.BoxGeometry(w,h,d);ge.translate(x,y+h/2,z);const col=colC[c]||(colC[c]=new T.Color(c)),n=ge.attributes.position.count,ca=new Float32Array(n*3);for(let i=0;i<n;i++){ca[i*3]=col.r;ca[i*3+1]=col.g;ca[i*3+2]=col.b}ge.setAttribute('color',new T.BufferAttribute(ca,3));(a[k]||(a[k]=[])).push(ge)}
function flush(g){const a=g.userData.acc;if(!a)return;delete g.userData.acc;for(const k in a){const p=k.split('|'),mat=new T.MeshStandardMaterial({vertexColors:true,roughness:+p[0],metalness:+p[1],transparent:+p[2]<1,opacity:+p[2],depthWrite:+p[2]>=1}),U=T.BufferGeometryUtils,geo=U&&U.mergeBufferGeometries?U.mergeBufferGeometries(a[k]):null;if(geo){const me=new T.Mesh(geo,mat);me.castShadow=+p[2]>=1;me.receiveShadow=true;if(+p[2]<1)me.userData.np=1;g.add(me)}else a[k].forEach(ge=>{const me=new T.Mesh(ge,mat);me.castShadow=+p[2]>=1;me.receiveShadow=true;if(+p[2]<1)me.userData.np=1;g.add(me)})}}
function koliCap(o){const top=o.km==='top'||o.type!=='shelf',lv=Math.max(2,o.lv|0),gap=(o.h-.03)/(lv-1),kw=+o.kw||.3,kd=+o.kd||.4,kh=+o.kh||.3,nx=Math.max(0,Math.floor((o.w+.001)/kw)),nz=Math.max(0,Math.floor((o.d+.001)/kd)),ny=Math.max(0,Math.floor((gap-.03+.001)/kh)),lay=top?Math.max(1,Math.round(+o.ku||2)):ny,slots=top?1:lv,per=nx*nz*lay;return{top,lv,gap,kw,kd,kh,nx,nz,ny,lay,slots,per,tot:per*slots}}
const koliN=o=>{const C=koliCap(o);const ws=WMS_HEATMAP?getObjWmsStats(o):null;const fp=ws?Math.min(100,ws.pct):(o.fp==null?100:+o.fp);return Math.round(C.tot*Math.min(100,Math.max(0,fp))/100)};
function koliFill(g,o,lv,gap){const C=koliCap(o);let left=koliN(o);
 for(let s=0;s<C.slots&&left>0;s++)for(let k=0;k<C.lay&&left>0;k++)for(let r=0;r<C.nz&&left>0;r++)for(let j=0;j<C.nx&&left>0;j++){left--;const x=-o.w/2+(o.w-C.nx*C.kw)/2+(j+.5)*C.kw,z=-o.d/2+(o.d-C.nz*C.kd)/2+(r+.5)*C.kd,y=C.top?o.h+k*C.kh:s*gap+.03+k*C.kh;
  koliBox(g,x,y,z,C.kw,C.kh,C.kd,o,s+j+k+r,undefined,C.tot>60)}}
function koliBox(g,x,y,z,kw,kh,kd,o,idx,c,lite){
 if(o.pk==='karton'){bx(g,kw-.01,kh-.01,kd-.01,c||['#c8a46a','#c19c60','#cfae74'][idx%3],x,y+.002,z,{roughness:.85});bx(g,Math.min(.05,kw*.2),.004,kd-.014,'#e4d5b0',x,y+kh-.009,z);return}
 const base=c||PAL[idx%PAL.length],n=lite?2:Math.max(2,Math.round(kh/.07)),lt=(kh-.03)/n-.004;
 for(let i=0;i<n;i++){const cc=new T.Color(base).offsetHSL(0,0,((i%3)-1)*.05);bx(g,kw-.04,lt,kd-.04,'#'+cc.getHexString(),x,y+.012+i*(lt+.004),z,{roughness:.95})}
 bx(g,kw-.008,kh-.008,kd-.008,'#e6f4ff',x,y+.002,z,{roughness:.12,opacity:.3});
 if(!lite)bx(g,kw*.4,Math.min(.07,kh*.25),.003,'#ffffff',x,y+kh*.45,z+kd/2-.002,{roughness:.6})}
const pkSel=o=>\`<label class="full">Kemasan koli<select onchange="upd('pk',this.value,1)"><option value="plastik"\${o.pk!=='karton'?' selected':''}>Plastik bening</option><option value="karton"\${o.pk==='karton'?' selected':''}>Karton</option></select></label>\`;
function koliTxt(o){const C=koliCap(o);return C.top?\`Di atas: \${C.nx} × \${C.nz} × \${C.lay} lapis = \${C.tot} koli · terisi \${koliN(o)}\`:\`Per tingkat: \${C.nx} × \${C.nz} × \${C.ny} = \${C.per} koli · \${C.lv} tingkat (termasuk atas rak) = kapasitas \${C.tot} koli · terisi \${koliN(o)}\`}
const KS=['shelf','table','bench','rack','shoerack','sewrack'];
function koliP2(o){const sh=o.type==='shelf';let h=\`<label class="chk full"><input type="checkbox" \${o.kl?'checked':''} onchange="upd('kl',this.checked,1);drawP()">\${sh?'Isi koli (simulasi kapasitas)':'Penuhi koli di atasnya'}</label>\`;
 if(o.kl){h+=pkSel(o);if(sh)h+=\`<label class="full">Isi di<select onchange="upd('km',this.value,1);drawP()"><option value="all"\${o.km!=='top'?' selected':''}>Semua tingkat</option><option value="top"\${o.km==='top'?' selected':''}>Hanya di atas rak</option></select></label>\`;
  h+=[['kw','Koli P (cm)',.3],['kd','Koli L (cm)',.4],['kh','Koli T (cm)',.3]].map(k=>\`<label>\${k[1]}<input type="number" step="1" value="\${Math.round((+o[k[0]]||k[2])*100)}" oninput="upd('\${k[0]}',this.value/100)"></label>\`).join('');
  if(!sh||o.km==='top')h+=\`<label>Tumpuk di atas (lapis)<input type="number" min="1" step="1" value="\${o.ku||2}" oninput="upd('ku',this.value)"></label>\`;
  h+=\`<label>Terisi (%)<input type="number" min="0" max="100" step="5" value="\${o.fp==null?100:o.fp}" oninput="upd('fp',this.value)"></label><div class="full mu" id="kcap">\${koliTxt(o)}</div>\`}return h}
function koliNorm(o){if(!o.kw){o.kw=o.w;o.kd=o.d;o.kh=o.h;o.nx=o.nz=o.ny=1}}
const ktotTxt=o=>\`Total \${o.nx*o.nz*o.ny} koli · ukuran blok \${(+o.w).toFixed(2)} × \${(+o.d).toFixed(2)} × \${(+o.h).toFixed(2)} m\`;
function koliBlockP(o){koliNorm(o);const f=(k,l,sc)=>\`<label>\${l}<input type="number" step="1" min="1" value="\${Math.round(o[k]*sc*10)/10}" oninput="kset('\${k}',this.value/\${sc})" onchange="drawP()"></label>\`;
 return f('kw','Koli P (cm)',100)+f('kd','Koli L (cm)',100)+f('kh','Koli T (cm)',100)+f('nx','Kolom (per baris)',1)+f('nz','Jumlah baris',1)+f('ny','Tumpuk (lapis)',1)+\`<div class="full mu" id="ktot">\${ktotTxt(o)}</div>\`}
function kset(k,v){const o=cur();if(!o||o.type!=='koli')return;koliNorm(o);v=parseFloat(v);if(!(v>0))return;if(k==='nx'||k==='nz'||k==='ny')v=Math.min(50,Math.max(1,Math.round(v)));o[k]=v;o.w=o.nx*o.kw;o.d=o.nz*o.kd;o.h=o.ny*o.kh;renderObjs();const t=$('ktot');if(t)t.textContent=ktotTxt(o);save(k+o.id)}
function koliSum(){const L=S.objs.filter(o=>KS.includes(o.type)&&o.kl),lo=S.objs.filter(o=>o.type==='koli').reduce((a,o)=>a+(o.nx||1)*(o.nz||1)*(o.ny||1),0);if(!L.length&&!lo)return '';const n=L.reduce((a,o)=>a+koliN(o),0),c=L.reduce((a,o)=>a+koliCap(o).tot,0);return (L.length?\` · Koli di rak \${n} (kapasitas \${c})\`:'')+(lo?\` · Koli lepas/blok \${lo}\`:'')}
function wallBuild(g,o){const w=o.w,h=o.h,d=o.d,c=o.c,n=Math.min(2,+o.dr||0);if(!n){bx(g,w,h,d,c,0,0,0,{roughness:.9});return}
 const dw=Math.min(+o.dw||.9,w*(n===2?.35:.8)),dh=Math.min(+o.dh||2.1,h-.05),cl=v=>Math.max(dw/2,Math.min(w-dw/2,v)),ctr=n===1?[cl(w*(o.dp==null?.5:o.dp/100))]:[cl(w*.25),cl(w*.75)],cuts=ctr.map(v=>[v-dw/2,v+dw/2]).sort((a,b)=>a[0]-b[0]),ang=(+o.da||0)*Math.PI/180,dc=o.dc||'#7a5230';
 let x=0;cuts.forEach(cu=>{if(cu[0]>x+.001)bx(g,cu[0]-x,h,d,c,-w/2+x+(cu[0]-x)/2,0,0,{roughness:.9});x=cu[1]});if(x<w-.001)bx(g,w-x,h,d,c,-w/2+x+(w-x)/2,0,0,{roughness:.9});
 const leaf=(hx,lw,sg)=>{const lf=new T.Group();bxm(lf,lw,dh-.03,.04,dc,sg*lw/2,0,0);bxm(lf,.03,.03,.08,'#cfcfcf',sg*(lw-.07),1,0,{metalness:.8});lf.position.set(hx,0,0);lf.rotation.y=sg*ang;g.add(lf)};
 cuts.forEach(cu=>{const cx=-w/2+(cu[0]+cu[1])/2;if(h>dh+.01)bx(g,dw,h-dh,d,c,cx,dh,0,{roughness:.9});
  bx(g,.05,dh,d+.02,'#5b3f22',cx-dw/2+.025,0,0);bx(g,.05,dh,d+.02,'#5b3f22',cx+dw/2-.025,0,0);bx(g,dw,.05,d+.02,'#5b3f22',cx,dh-.05,0);
  if(o.dd){const lw=(dw-.04)/2;leaf(cx-dw/2+.02,lw,1);leaf(cx+dw/2-.02,lw,-1)}else leaf(cx-dw/2+.02,dw-.04,1)})}
function wallP(o){const n=+o.dr||0;let h=\`<label class="full">Pintu pada dinding<select onchange="upd('dr',+this.value,1);drawP()"><option value="0"\${!n?' selected':''}>Tanpa pintu</option><option value="1"\${n===1?' selected':''}>1 pintu</option><option value="2"\${n===2?' selected':''}>2 pintu</option></select></label>\`;
 if(n){h+=[['dw','Lebar pintu (cm)',.9],['dh','Tinggi pintu (cm)',2.1]].map(k=>\`<label>\${k[1]}<input type="number" step="5" value="\${Math.round((+o[k[0]]||k[2])*100)}" oninput="upd('\${k[0]}',this.value/100)"></label>\`).join('')+\`<label>Buka pintu (°)<input type="number" step="15" min="-90" max="90" value="\${o.da||0}" oninput="upd('da',this.value)"></label><label>Warna pintu<input type="color" value="\${o.dc||'#7a5230'}" oninput="upd('dc',this.value,1)"></label><label class="chk full"><input type="checkbox" \${o.dd?'checked':''} onchange="upd('dd',this.checked,1)">Pintu ganda (dua daun per bukaan)</label>\`;if(n===1)h+=\`<label class="full">Posisi pintu (% dari kiri)<input type="number" min="0" max="100" step="5" value="\${o.dp==null?50:o.dp}" oninput="upd('dp',this.value)"></label>\`}return h}
function mk(o){
 const g=new T.Group(),{w,d,h,type:t}=o;
 const ws = getObjWmsStats(o);
 const c = (WMS_HEATMAP && ws && (t==='shelf'||t==='rack'||t==='koli')) ? ws.col : o.c;
 if(t==='rack'){const m=.04;[-1,1].forEach(s=>{bx(g,m,h,m,c,s*(w/2-m),0,0,{metalness:.6,roughness:.4});bx(g,.05,.04,d,c,s*(w/2-.03),0,0,{metalness:.6})});
  const r=new T.Mesh(new T.CylinderGeometry(.015,.015,w-.04,10),new T.MeshStandardMaterial({color:'#cfd3d6',metalness:.8,roughness:.3}));r.rotation.z=Math.PI/2;r.position.y=h-.05;r.castShadow=true;g.add(r);
  if(S.cl){const n=Math.max(2,Math.floor((w-.2)/.06)),ch=Math.max(.3,h*.55);const lim=WMS_HEATMAP&&ws?Math.ceil(n*Math.min(100,ws.pct)/100):n;for(let i=0;i<lim;i++){const hh=ch*(.8+((i*13)%4)*.05);bx(g,.035,hh,d*.55,WMS_HEATMAP&&ws?ws.col:PAL[(i*7+o.id)%PAL.length],-w/2+.12+i*(w-.24)/(n-1),h-.07-hh,0,{roughness:.95})}}}
 else if(t==='shelf'){const lv=Math.max(2,o.lv|0),gap=(h-.03)/(lv-1);if(o.kl)koliFill(g,o,lv,gap);[-1,1].forEach(a=>[-1,1].forEach(b=>bx(g,.04,h,.04,c,a*(w/2-.02),0,b*(d/2-.02))));
  for(let i=0;i<lv;i++){
   const slotLv = ws && ws.matched && ws.matched[i] ? ws.matched[i] : null;
   const shelfCol = (WMS_HEATMAP && slotLv) ? (slotLv.fillPercent>=100?'#ef4444':slotLv.fillPercent>=80?'#f59e0b':slotLv.currentQty>0?'#10b981':'#64748b') : c;
   bx(g,w,.03,d,shelfCol,0,i*gap,0);
   if(S.cl&&!o.kl&&i<lv-1){
    const ch=Math.min((gap-.03)*.8,.3),n=Math.max(1,Math.floor((w-.1)/.34)),cw=(w-.1)/n-.04;
    const fillRatio = WMS_HEATMAP && ws ? (slotLv ? Math.min(1, slotLv.fillPercent / 100) : Math.min(1, ws.pct / 100)) : 1;
    const activeN = WMS_HEATMAP && ws ? Math.ceil(n * fillRatio) : n;
    for(let j=0;j<activeN;j++)bx(g,cw,ch*(.65+((j*7+i*3)%4)*.12),d*.8,WMS_HEATMAP&&ws?shelfCol:PAL[(i*3+j*5+o.id)%PAL.length],-w/2+.05+(j+.5)*(w-.1)/n,i*gap+.03,0,{roughness:.95})
   }
  }}
 else if(t==='table'){bx(g,w,.04,d,c,0,h-.04,0);[-1,1].forEach(a=>[-1,1].forEach(b=>bx(g,.05,h-.04,.05,c,a*(w/2-.05),0,b*(d/2-.05))))}
 else if(t==='bench'){bx(g,w,.05,d,c,0,h-.05,0);[-1,1].forEach(a=>[-1,1].forEach(b=>bx(g,.05,h-.05,.05,c,a*(w/2-.06),0,b*(d/2-.06))))}
 else if(t==='wall')wallBuild(g,o);
 else if(t==='window'){bx(g,w,.05,d,c,0,0,0);bx(g,w,.05,d,c,0,h-.05,0);[-1,1].forEach(s=>bx(g,.05,h-.1,d,c,s*(w/2-.025),.05,0));bx(g,.03,h-.1,d*.6,c,0,.05,0);
  const gl=new T.Mesh(new T.BoxGeometry(w-.1,h-.1,.015),new T.MeshPhysicalMaterial({color:0xaed8f0,transparent:true,opacity:.3,roughness:.05,metalness:.1}));gl.position.y=h/2;g.add(gl)}
 else if(t==='door'){[-1,1].forEach(s=>bx(g,.06,h,d,c,s*(w/2-.03),0,0));bx(g,w,.06,d,c,0,h-.06,0);bx(g,w-.12,h-.06,.05,c,0,0,0);bx(g,.03,.03,.1,'#c9c9c9',w/2-.15,1,0,{metalness:.9})}
 else if(t==='stairs'){const L2=Math.max(.5,+o.s2||3),hl=Math.min(Math.max(.3,+o.hl||1),h*.8),L1=Math.max(.3,d-w),x0=-(w+L2)/2,z0=-d/2,k=.18,n1=Math.max(1,Math.round(hl/k)),n2=Math.max(2,Math.round((h-hl)/k)),tt=.05,zc=z0+L1+w/2;
  const sr=(len,rise,cx,cy,cz,ax)=>{const l=Math.hypot(len,rise),m=bxm(g,ax?l:.05,.22,ax?.05:l,c,cx,cy-.11,cz);if(ax)m.rotation.z=Math.atan2(rise,len);else m.rotation.x=-Math.atan2(rise,len)};
  for(let i=0;i<n1;i++)bx(g,w,tt,L1/n1,c,x0+w/2,(i+1)*hl/n1-tt,z0+(i+.5)*L1/n1,{roughness:.85});
  bx(g,w,.1,w,c,x0+w/2,hl-.1,zc,{roughness:.85});
  for(let i=0;i<n2;i++)bx(g,L2/n2,tt,w,c,x0+w+(i+.5)*L2/n2,hl+(i+1)*(h-hl)/n2-tt,zc,{roughness:.85});
  [x0+.025,x0+w-.025].forEach(xs=>sr(L1,hl,xs,hl/2-.06,z0+L1/2,0));
  [zc-w/2+.025,zc+w/2-.025].forEach(zs=>sr(L2,h-hl,x0+w+L2/2,hl+(h-hl)/2-.06,zs,1));
  [[x0+.05,zc-w/2+.05],[x0+w-.05,zc-w/2+.05],[x0+.05,zc+w/2-.05],[x0+w-.05,zc+w/2-.05]].forEach(p=>bx(g,.08,hl-.1,.08,c,p[0],0,p[1]))}
 else if(t==='chair'){const sh=h*.48;for(let i=0;i<5;i++){const lg=new T.Group();bx(lg,.3,.04,.05,'#333',.15,.06,0);bx(lg,.05,.06,.05,'#111',.28,0,0);flush(lg);lg.rotation.y=i*Math.PI*2/5;g.add(lg)}
  bx(g,.06,sh-.18,.06,'#555',0,.1,0);bx(g,w*.85,.08,d*.85,c,0,sh-.08,0,{roughness:.9});bx(g,w*.8,Math.max(.2,h-sh-.1),.07,c,0,sh+.04,-d*.4,{roughness:.9});
  [-1,1].forEach(s=>{bx(g,.04,.2,.04,'#222',s*w*.42,sh,0);bx(g,.05,.04,d*.5,'#222',s*w*.42,sh+.2,0)})}
 else if(t==='sewing'||t==='serger'){const th=Math.min(.78,h-(t==='sewing'?.35:.55)),M='#3a3a3a';bx(g,w,.04,d,'#b08b5a',0,th-.04,0);[-1,1].forEach(a=>{bx(g,.05,th-.04,d*.8,M,a*(w/2-.1),0,0);bx(g,.05,.03,d*.95,M,a*(w/2-.1),0,0)});bx(g,w-.2,.03,.04,M,0,.18,0);bx(g,.3,.03,.12,'#222',0,.03,d*.2);
  if(t==='sewing'){bx(g,.38,.05,.17,c,0,th,0);bx(g,.07,.2,.1,c,-.14,th+.05,0);bx(g,.36,.07,.1,c,0,th+.25,0);bx(g,.015,.12,.015,'#bbb',.13,th+.13,0);const wl=new T.Mesh(new T.CylinderGeometry(.05,.05,.03,16),new T.MeshStandardMaterial({color:'#222'}));wl.rotation.z=Math.PI/2;wl.position.set(-.2,th+.28,0);g.add(wl);const sp=new T.Mesh(new T.CylinderGeometry(.025,.025,.06,12),new T.MeshStandardMaterial({color:PAL[o.id%PAL.length]}));sp.position.set(.05,th+.35,0);g.add(sp)}
  else{bx(g,.34,.04,.28,'#333',0,th,0);bx(g,.3,.26,.24,c,0,th+.04,0);bx(g,.26,.04,.2,'#555',0,th+.3,0);for(let i=0;i<4;i++){const x=-.105+i*.07;bx(g,.012,.2,.012,'#aaa',x,th+.3,-.12);const cn=new T.Mesh(new T.CylinderGeometry(.015,.04,.12,12),new T.MeshStandardMaterial({color:PAL[(i*3+o.id)%PAL.length]}));cn.position.set(x,th+.56,-.12);cn.castShadow=true;g.add(cn)}}}
 else if(t==='sewrack'){const lv=Math.max(2,o.lv|0),gap=(h-.03)/(lv-1);[-1,1].forEach(a=>[-1,1].forEach(b=>bx(g,.04,h,.04,c,a*(w/2-.02),0,b*(d/2-.02))));bx(g,w-.04,h-.1,.02,'#b9ad98',0,.05,-d/2+.01);
  for(let i=0;i<lv;i++){bx(g,w,.03,d,c,0,i*gap,0);if(S.cl&&i<lv-1){const y=i*gap+.03,sp=Math.min(gap-.06,.14);
   if(i>=lv-3){const n=Math.max(2,Math.floor((w-.1)/.06)),rows=Math.max(1,Math.floor((d-.08)/.06));for(let r=0;r<rows;r++)for(let j=0;j<n;j++){bx(g,.044,sp,.044,PAL[(i*5+j*3+r*7+o.id)%PAL.length],-w/2+.06+j*(w-.12)/(n-1),y,-d/2+.05+r*.06,{roughness:.8})}}
   else{const n=Math.max(1,Math.floor((w-.1)/.3)),cw=(w-.1)/n-.04;for(let j=0;j<n;j++)bx(g,cw,Math.min(gap-.08,.22),d*.75,['#7ba7a5','#c2574f','#9fb8d6','#c8d5b9'][(i+j)%4],-w/2+.05+(j+.5)*(w-.1)/n,y,.02,{roughness:.8})}}}}
 else if(t==='shoerack'){const lv=Math.max(2,o.lv|0),gap=(h-.03)/(lv-1);[-1,1].forEach(a=>[-1,1].forEach(b=>bx(g,.03,h,.03,c,a*(w/2-.015),0,b*(d/2-.015))));
  for(let i=0;i<lv;i++){bx(g,w,.025,d,c,0,i*gap,0);if(S.cl&&i<lv-1){const y=i*gap+.025,n=Math.max(1,Math.floor((w-.06)/.24)),sl=Math.min(d-.04,.28),hh=Math.max(.04,Math.min(gap-.06,.11));
   for(let j=0;j<n;j++){const x=-w/2+.03+(j+.5)*(w-.06)/n,col=PAL[(i*3+j*5+o.id)%PAL.length],sandal=(i+j)%3===0;
    [-1,1].forEach(s=>{const sx=x+s*.055;bx(g,.085,.02,sl,'#2b2b2b',sx,y,0,{roughness:.9});
     if(sandal){bx(g,.085,.015,.03,col,sx,y+.02,-sl*.1);bx(g,.085,.015,.03,col,sx,y+.02,sl*.2)}
     else{bx(g,.08,hh,sl*.4,col,sx,y+.02,-sl*.3,{roughness:.7});bx(g,.08,hh*.55,sl*.45,col,sx,y+.02,sl*.2,{roughness:.7})}})}}}
  if(o.dr){[-1,1].forEach(s=>bx(g,.02,h,d,c,s*(w/2-.01),0,0));bx(g,w,.02,d,c,0,h-.02,0);bx(g,w,h,.015,c,0,0,-d/2+.0075);
   [-1,1].forEach(s=>{bx(g,w/2-.01,h-.04,.02,'#b79a78',s*w/4,.02,d/2-.01);bx(g,.015,.12,.02,'#cfcfcf',s*.03,h/2-.06,d/2+.005,{metalness:.8})})}}
 else if(t==='room'||t==='bath'){const wt=.12,wo={opacity:.35,roughness:.9},wc='#f2efe9',dw=Math.min(.9,(w-2*wt)*.5),l1=(w/2-wt)-dw/2;
  bx(g,w,.2,d,c,0,-.2,0,{roughness:.6});[-1,1].forEach(s=>bx(g,wt,h,d,wc,s*(w/2-wt/2),0,0,wo));bx(g,w-2*wt,h,wt,wc,0,0,-d/2+wt/2,wo);
  [-1,1].forEach(s=>bx(g,l1,h,wt,wc,s*(dw/2+l1/2),0,d/2-wt/2,wo));if(h>2.15)bx(g,dw,h-2.1,wt,wc,0,2.1,d/2-wt/2,wo);
  if(t==='bath'){const tx=-w/2+.55,tz=-d/2+wt+.4,sx=w/2-.5,sz=-d/2+wt+.3,kx=-w/2+wt+.45;
   bx(g,.38,.38,.2,'#f6f6f6',tx,.4,tz-.22);bx(g,.36,.4,.48,'#f6f6f6',tx,0,tz+.05);bx(g,.34,.03,.44,'#e4e4e4',tx,.4,tz+.06);
   bx(g,.12,.7,.12,'#f2f2f2',sx,0,sz);bx(g,.5,.12,.4,'#f6f6f6',sx,.7,sz);bx(g,.03,.12,.03,'#bbbbbb',sx,.82,sz-.12,{metalness:.8});bx(g,.45,.5,.015,'#cfe8f5',sx,1.2,-d/2+wt+.01,{roughness:.1});
   bx(g,.8,.7,.8,'#b8c2c9',kx,0,0);bx(g,.7,.02,.7,'#8ec5e6',kx,.7,0,{roughness:.1,opacity:.7})}}
 else if(t==='laptop'){bx(g,w,.02,d,c,0,0,0,{metalness:.5,roughness:.4});bx(g,w*.86,.003,d*.45,'#2a2a2a',0,.02,d*.12);bx(g,w*.3,.002,d*.22,'#555555',0,.02,d*.33);
  const Hs=Math.max(.1,(h-.02)/Math.cos(.26)),lid=new T.Group();bxm(lid,w,Hs,.012,c,0,0,0,{metalness:.5,roughness:.4});bxm(lid,w-.03,Hs-.03,.002,'#16233a',0,.015,.0065,{emissive:'#1b3b6b',emissiveIntensity:.8,roughness:.2});lid.position.set(0,.02,-d/2+.006);lid.rotation.x=-.26;g.add(lid)}
 else if(t==='printer'){bx(g,w,h*.62,d,c,0,0,0,{roughness:.5});bx(g,w*.98,h*.28,d*.95,'#e6e6e6',0,h*.62,-d*.02,{roughness:.5});bx(g,w*.9,.005,d*.7,'#2a2f36',0,h*.9,-d*.05,{roughness:.2});
  bx(g,w*.28,h*.1,.01,'#222222',w*.25,h*.68,d*.47);bx(g,.01,.01,.005,'#3ddc84',w*.2,h*.71,d*.475,{emissive:'#3ddc84'});bx(g,w*.7,.012,.01,'#111111',0,h*.36,d/2-.003);
  bx(g,w*.8,.012,d*.22,'#dcdcdc',0,h*.18,d/2+d*.05);bx(g,w*.7,.003,d*.2,'#ffffff',0,h*.18+.012,d/2+d*.05)}
 else if(t==='koli'){koliNorm(o);const tot=o.nx*o.nz*o.ny,lite=tot>60;for(let i=0;i<o.ny;i++)for(let k=0;k<o.nz;k++)for(let j=0;j<o.nx;j++)koliBox(g,-o.w/2+(j+.5)*o.kw,i*o.kh,-o.d/2+(k+.5)*o.kd,o.kw,o.kh,o.kd,o,o.id+i+j+k,c,lite)}
 else if(t==='zone'){const cw=512,chh=Math.max(128,Math.min(1024,Math.round(512*d/w))),cn=document.createElement('canvas');cn.width=cw;cn.height=chh;const x=cn.getContext('2d');x.globalAlpha=.5;x.fillStyle=c;x.fillRect(0,0,cw,chh);x.globalAlpha=1;x.strokeStyle=c;x.lineWidth=8;x.strokeRect(4,4,cw-8,chh-8);x.fillStyle='#111';x.font='bold 44px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText(o.n,cw/2,chh/2,cw-30);
  const p=new T.Mesh(new T.PlaneGeometry(w,d),new T.MeshBasicMaterial({map:new T.CanvasTexture(cn),transparent:true,side:T.DoubleSide}));p.rotation.x=-Math.PI/2;p.position.y=.015;g.add(p)}
 if(o.kl&&t!=='shelf'&&KS.includes(t))koliFill(g,o,0,0);flush(g);if(o.lk){const k=new T.Mesh(new T.SphereGeometry(.07,10,8),new T.MeshBasicMaterial({color:0xf5a623}));k.position.set(0,(o.type==='zone'?.2:+o.h)+.15,0);g.add(k)}
 g.position.set(o.x+fo(o.floor).x,elev(o.floor)+(+o.y||0),o.z+fo(o.floor).z);g.rotation.y=o.rot*Math.PI/180;if(o.mir)g.scale.x=-1;g.userData.id=o.id;return g}
function tagSprite(txt,col){const cn=document.createElement('canvas'),x=cn.getContext('2d'),F0='bold 42px system-ui,sans-serif';x.font=F0;const W=Math.ceil(Math.min(920,x.measureText(txt).width)+56),H=94;cn.width=W;cn.height=H;x.font=F0;x.fillStyle='rgba(15,23,42,.92)';x.strokeStyle=col;x.lineWidth=6;const r=22;x.beginPath();x.moveTo(r+3,3);x.arcTo(W-3,3,W-3,H-3,r);x.arcTo(W-3,H-3,3,H-3,r);x.arcTo(3,H-3,3,3,r);x.arcTo(3,3,W-3,3,r);x.closePath();x.fill();x.stroke();x.fillStyle='#f8fafc';x.textAlign='center';x.textBaseline='middle';x.fillText(txt,W/2,H/2+2,W-40);const sp=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(cn),depthTest:false,transparent:true}));sp.scale.set(.34*W/H,.34,1);sp.renderOrder=8;return sp}
function renderObjs(){inv();if(ssig()!==SSig)buildB();
 sc.remove(OG);disp(OG);BHs.forEach(b=>{sc.remove(b);b.geometry.dispose();b.material.dispose()});BHs=[];OG=new T.Group();sc.add(OG);sc.remove(TG);disp(TG);TG=new T.Group();sc.add(TG);
 S.objs.forEach(o=>{
  if(!S.all&&o.floor>S.cur||o.floor>=S.floors.length)return;
  const g=mk(o);OG.add(g);
  const ws = getObjWmsStats(o);
  const labelTxt = o.tg ? o.tg : (WMS_SHOW_RACK_TAGS && ws && (o.floor===S.cur || S.all) ? \`\${ws.code} (\${ws.pct}%)\` : '');
  const labelCol = ws ? ws.col : (o.tc||'#6366f1');
  if(labelTxt&&S.tags!==false){const sp=tagSprite(labelTxt,labelCol);sp.userData.id=o.id;sp.position.set(o.x+fo(o.floor).x,elev(o.floor)+(+o.y||0)+(o.type==='zone'?.05:+o.h)+.3,o.z+fo(o.floor).z);TG.add(sp)}
  if(S.ms.includes(o.id)){const b=new T.BoxHelper(g,o.lk?0x888888:o.id===S.sel?0xff6a00:0x2f9bff);BHs.push(b);sc.add(b)}
 });
 sc.remove(HG);disp(HG);HG=new T.Group();sc.add(HG);if(S.ms.length===1){const o=cur();if(o&&!o.lk&&(S.all||o.floor<=S.cur)&&o.floor<S.floors.length)addHandles(o)}sc.remove(FH);disp(FH);FH=new T.Group();sc.add(FH);if(!S.ms.length&&S.fh!==false)addFH();sum();drawIC();notifySelectedToParent()}
function notifySelectedToParent(){
  const o=S.ms.length===1?cur():null;
  if(!o){window.parent.postMessage({type:'WMS_3D_SELECT_OBJ',payload:null},'*');return;}
  const ws=getObjWmsStats(o);
  window.parent.postMessage({
    type:'WMS_3D_SELECT_OBJ',
    payload:{
      objId:o.id,
      name:o.tg||o.n,
      type:D[o.type]?D[o.type].n:o.type,
      floor:o.floor+1,
      wmsCode:o.wmsCode||'',
      curQty:ws?ws.curQty:0,
      maxCap:ws?ws.maxCap:0,
      pct:ws?ws.pct:0,
      codes:ws?ws.codes:[]
    }
  },'*');
}
function tagList(){
  const L=S.objs.filter(o=>o.tg||o.wmsCode);
  $('tgl').innerHTML=L.length?L.map(o=>{
    const ws=getObjWmsStats(o);
    const badge=ws?\`<span style="font-family:monospace;font-size:10px;font-weight:700;color:\${ws.col}">\${ws.curQty}/\${ws.maxCap} (\${ws.pct}%)</span>\`:'';
    return \`<div class="tgi" title="\${esc(o.ds||'')}" onclick="goTo(\${o.id})"><span>Lt \${o.floor+1} · <b>\${esc(o.wmsCode||o.tg||o.n)}</b></span>\${badge}</div>\`;
  }).join(''):'Belum ada rak/penanda.';
}
function goTo(id){const o=S.objs.find(o=>o.id===id);if(!o)return;if(o.floor!==S.cur)goF(o.floor);setSel(grp(id))}
function sum(){tagList();const c={};S.objs.forEach(o=>c[D[o.type].n.split(' ')[0]==='Zona'?'Zona':D[o.type].n]=(c[D[o.type].n.split(' ')[0]==='Zona'?'Zona':D[o.type].n]||0)+1);$('sm').textContent=Object.keys(c).length?Object.entries(c).map(a=>a[0]+' ×'+a[1]).join(' · ')+koliSum():'Belum ada aset.'}
// UI
$('pal').innerHTML=Object.keys(D).map(k=>\`<button onclick="add('\${k}')">\${D[k].n.replace(/ QC$/,'')}</button>\`).join('');
function add(t){const o=Object.assign({id:S.uid++,type:t,floor:S.cur,x:((S.uid%6)-3)*1.2,z:0,rot:0,y:0},D[t]);if(t==='stairs')o.h=S.floors[S.cur].H;if(t==='room'||t==='bath'){const f=S.floors[S.cur],n=S.objs.filter(p=>(p.type==='room'||p.type==='bath')&&p.floor===S.cur).length;o.x=n*(o.w+.3);o.z=-(f.W/2+o.d/2)}if(S.floors[S.cur].lk)o.lk=1;S.objs.push(o);setSel([o.id]);save()}
const F=(o,k,l,s)=>\`<label>\${l}<input type="number" step="\${s||.05}" value="\${+(+o[k]||0).toFixed(3)}" \${o.lk&&['x','z','y','rot'].includes(k)?'disabled':''} oninput="upd('\${k}',this.value)"></label>\`;
function drawP(){if(S.ms.length>1){const L=S.objs.filter(o=>S.ms.includes(o.id)),gs=new Set(L.map(o=>o.gid||0)),ing=gs.size===1&&!gs.has(0);$('pp').innerHTML=\`<p><b>\${L.length} aset dipilih</b>\${ing?' (satu grup)':''}</p><div class="row"><button onclick="\${ing?'ungrp()':'mkgrp()'}">\${ing?'Lepas grup':'Buat grup'}</button><button onclick="rot()">Putar grup 90°</button></div><div class="row"><button onclick="dup()">Duplikat</button><button onclick="dupAll()">Ke semua lantai</button><button class="dn" onclick="del()">Hapus</button></div><div class="row"><button onclick="tgLock(true)">Kunci</button><button onclick="tgLock(false)">Buka kunci</button></div><div class="g2" style="margin-top:8px"><label>Pindah lantai<select onchange="mvF(this.value)">\${S.floors.map((f,i)=>\`<option value="\${i}"\${i===S.cur?' selected':''}>Lantai \${i+1}</option>\`).join('')}</select></label><label>Warna semua<input type="color" value="#cccccc" oninput="colAll(this.value)"></label></div><div class="mu" style="margin:10px 0 4px">Pilih satu aset untuk mengubah nama, kode rak WMS, dan deskripsinya:</div>\${L.slice(0,40).map(o=>\`<div class="tgi" onclick="setSel([\${o.id}])"><span>\${esc(o.wmsCode||o.tg||o.n)} · \${esc(D[o.type]?D[o.type].n:o.type)}</span></div>\`).join('')}\`;return}
 const o=cur();if(!o){$('pp').innerHTML='<p class="mu">Klik aset di 3D untuk mengedit ukuran, kode rak WMS, warna dan posisi.</p>';return}
 const ws=getObjWmsStats(o);
 const wmsSummaryHtml = ws ? \`<div class="wms-box full"><div style="display:flex;justify-content:space-between;align-items:center"><b>📦 Stok Live WMS (\${esc(ws.code)})</b><span style="color:\${ws.col};font-weight:800;font-family:monospace">\${ws.curQty} / \${ws.maxCap} pcs (\${ws.pct}%)</span></div><div class="wms-bar"><div class="wms-bar-fill" style="width:\${Math.min(100,ws.pct)}%;background:\${ws.col}"></div></div><div class="mu" style="font-size:10.5px">\${ws.matched.length} titik rak aktif · \${ws.skuCount} SKU tersimpan</div></div>\` : '';
 $('pp').innerHTML=\`<label class="full">Kode Rak WMS (mis. A001-A005, B001, R001)<input value="\${esc(o.wmsCode||'')}" placeholder="Contoh: A001-A005 atau STUDIO" oninput="upd('wmsCode',this.value,1)"></label>\${wmsSummaryHtml}<label class="full">Nama / label<input value="\${esc(o.n)}" list="zl" oninput="upd('n',this.value,1)"></label><label class="full">Penanda di 3D (mis. Meja QC)<input value="\${esc(o.tg||'')}" list="tl" oninput="upd('tg',this.value,1)"></label><datalist id="tl">\${TGS.map(z=>\`<option value="\${z}">\`).join('')}</datalist><label class="full">Deskripsi / fungsi<textarea class="ta2" rows="2" placeholder="mis. Rak penyimpanan baju lolos QC" oninput="upd('ds',this.value,1)">\${esc(o.ds||'')}</textarea></label><datalist id="zl">\${ZN.map(z=>\`<option value="\${z}">\`).join('')}</datalist><div class="g2"><label class="chk full"><input type="checkbox" \${o.lk?'checked':''} onchange="tgLock(this.checked)">Kunci posisi (tidak bisa digeser, diputar, dihapus)</label><label>Warna penanda<input type="color" value="\${o.tc||'#6366f1'}" oninput="upd('tc',this.value,1)"></label>\${F(o,'w','Panjang (m)')}\${F(o,'d','Lebar (m)')}\${F(o,'h','Tinggi (m)')}\${F(o,'y','Tinggi dari lantai (m)')}\${F(o,'x','Posisi X')}\${F(o,'z','Posisi Z')}\${gapF(o)}\${F(o,'rot','Rotasi (°)',15)}<label>Warna<input type="color" value="\${o.c}" oninput="upd('c',this.value,1)"></label>\${o.type==='shelf'||o.type==='sewrack'||o.type==='shoerack'?F(o,'lv','Jumlah tingkat',1):''}\${o.type==='shoerack'?\`<label class="chk full"><input type="checkbox" \${o.dr?'checked':''} onchange="upd('dr',this.checked,1)">Lemari tertutup (pakai pintu)</label>\`:''}\${KS.includes(o.type)?koliP2(o):''}\${o.type==='wall'?wallP(o):''}\${o.type==='koli'?koliBlockP(o)+pkSel(o)+putOn(o):''}\${o.type==='laptop'||o.type==='printer'?putOn(o):''}\${o.type==='stairs'?F(o,'hl','Tinggi bordes (m)')+F(o,'s2','Panjang lengan 2 (m)')+\`<label class="chk full"><input type="checkbox" \${o.mir?'checked':''} onchange="upd('mir',this.checked,1)">Balik arah L (cermin)</label>\`:''}<label>Lantai<select \${o.lk?'disabled':''} onchange="upd('floor',this.value)">\${S.floors.map((f,i)=>\`<option value="\${i}"\${i===o.floor?' selected':''}>Lantai \${i+1}</option>\`).join('')}</select></label></div><div class="row"><button onclick="dup()">Duplikat</button><button onclick="rot()">Putar 90°</button><button class="dn" onclick="del()">Hapus</button></div><div class="row"><button onclick="dupAll()">Salin ke semua lantai</button></div>\`}
function upd(k,v,s){const o=cur();if(!o)return;if(o.lk&&['x','z','y','rot','floor'].includes(k))return;if(!s){v=parseFloat(v);if(isNaN(v))return;if(['w','d','h'].includes(k)&&v<=.01)return;if(k==='lv'&&v<2)return}
 o[k]=v;if(o.type==='koli'&&['w','d','h'].includes(k)){koliNorm(o);o.nx=Math.max(1,Math.min(50,Math.round(o.w/o.kw)));o.nz=Math.max(1,Math.min(50,Math.round(o.d/o.kd)));o.ny=Math.max(1,Math.min(50,Math.round(o.h/o.kh)));o.w=o.nx*o.kw;o.d=o.nz*o.kd;o.h=o.ny*o.kh}if(k==='floor'){S.cur=v;buildB();drawFloors()}renderObjs();const kc=$('kcap');if(kc)kc.textContent=koliTxt(o);save(k+o.id)}
function dup(){if(!S.ms.length)return;const gm={},ids=[];S.objs.filter(o=>S.ms.includes(o.id)).forEach(o=>{const n=Object.assign({},o,{id:S.uid++,x:o.x+.5,z:o.z+.5});delete n.lk;if(o.gid){gm[o.gid]=gm[o.gid]||S.gid++;n.gid=gm[o.gid]}S.objs.push(n);ids.push(n.id)});setSel(ids);save()}
function rot(){const L=S.objs.filter(o=>S.ms.includes(o.id)&&!o.lk);if(!L.length)return;if(L.length===1)L[0].rot=((+L[0].rot||0)+90)%360;else{const cx=L.reduce((a,o)=>a+o.x,0)/L.length,cz=L.reduce((a,o)=>a+o.z,0)/L.length;L.forEach(o=>{const dx=o.x-cx,dz=o.z-cz;o.x=cx+dz;o.z=cz-dx;o.rot=((+o.rot||0)+90)%360})}renderObjs();drawP();save()}
function del(){if(!S.ms.length)return;S.objs=S.objs.filter(o=>!S.ms.includes(o.id)||o.lk);setSel(S.ms.filter(id=>S.objs.some(o=>o.id===id)));save()}
function setSel(ids){S.ms=ids;S.sel=ids.length?ids[ids.length-1]:null;renderObjs();drawP()}
function grp(id){const o=S.objs.find(o=>o.id===id);return o&&o.gid?S.objs.filter(p=>p.gid===o.gid).map(p=>p.id):[id]}
function select(id,add){if(id==null)return setSel([]);const g=grp(id);if(!add)return setSel(g);const on=g.every(i=>S.ms.includes(i));setSel(on?S.ms.filter(i=>!g.includes(i)):[...S.ms.filter(i=>!g.includes(i)),...g])}
function selAll(){setSel(S.objs.filter(o=>o.floor===S.cur).map(o=>o.id))}
function mkgrp(){if(S.ms.length<2)return;const g=S.gid++;S.objs.forEach(o=>{if(S.ms.includes(o.id))o.gid=g});drawP();save()}
function ungrp(){S.objs.forEach(o=>{if(S.ms.includes(o.id))delete o.gid});drawP();save()}
function mvF(v){v=+v;S.objs.forEach(o=>{if(S.ms.includes(o.id)&&!o.lk)o.floor=v});S.cur=v;oc.target.y=elev(v)+1.5;buildB();drawFloors();renderObjs();save()}
function colAll(v){S.objs.forEach(o=>{if(S.ms.includes(o.id))o.c=v});renderObjs();save('colall')}
function dupAll(){const src=S.objs.filter(o=>S.ms.includes(o.id));if(!src.length)return;const n=S.floors.length,ids=[];
 for(let f=0;f<n;f++){const gm={};src.forEach(o=>{if(o.floor===f)return;if(o.type==='stairs'&&f>=n-1)return;if(S.objs.some(p=>p.floor===f&&p.type===o.type&&p.x===o.x&&p.z===o.z&&p.rot===o.rot))return;const c=Object.assign({},o,{id:S.uid++,floor:f});if(o.type==='stairs')c.h=S.floors[f].H;if(o.gid){gm[o.gid]=gm[o.gid]||S.gid++;c.gid=gm[o.gid]}S.objs.push(c);ids.push(c.id)})}
 if(!ids.length)return;renderObjs();drawP();save()}
function gapF(o){const f=S.floors[o.floor],b=bb(o),v=[b.x0+f.L/2,f.L/2-b.x1,b.z0+f.W/2,f.W/2-b.z1],dis=o.lk?'disabled':'';return ['kiri','kanan','belakang','depan'].map((n,i)=>\`<label>Jarak \${n} (m)<input type="number" step="0.01" value="\${v[i].toFixed(2)}" \${dis} onchange="setGap(\${i},this.value)"></label>\`).join('')}
function setGap(i,v){const o=cur();if(!o||o.lk)return;v=parseFloat(v);if(isNaN(v))return;const f=S.floors[o.floor],b=bb(o);if(i===0)o.x+=v-(b.x0+f.L/2);else if(i===1)o.x+=(f.L/2-v)-b.x1;else if(i===2)o.z+=v-(b.z0+f.W/2);else o.z+=(f.W/2-v)-b.z1;renderObjs();drawP();save()}
function nudge(k,e){const L=S.objs.filter(o=>S.ms.includes(o.id)&&!o.lk);if(!L.length)return;const st=e.altKey?.01:e.shiftKey?.25:.05,fx=oc.target.x-cam.position.x,fz=oc.target.z-cam.position.z,n=Math.hypot(fx,fz)||1,f=[fx/n,fz/n],r=[-f[1],f[0]],d=k==='arrowright'?r:k==='arrowleft'?[-r[0],-r[1]]:k==='arrowup'?f:[-f[0],-f[1]];let ax=0,az=0;if(Math.abs(d[0])>Math.abs(d[1]))ax=Math.sign(d[0])*st;else az=Math.sign(d[1])*st;L.forEach(o=>{const fl=S.floors[o.floor];o.x=Math.max(-fl.L/2-EXT,Math.min(fl.L/2+EXT,+(o.x+ax).toFixed(3)));o.z=Math.max(-fl.W/2-EXT,Math.min(fl.W/2+EXT,+(o.z+az).toFixed(3)))});renderObjs();drawP();save('nudge')}
function tgLock(v){S.objs.forEach(o=>{if(S.ms.includes(o.id)){if(v)o.lk=1;else delete o.lk}});renderObjs();drawP();save()}
function lockFlSet(i,v){const f=S.floors[i];if(v)f.lk=1;else delete f.lk;S.objs.forEach(o=>{if(o.floor===i){if(v)o.lk=1;else delete o.lk}});renderObjs();drawFloors();drawP();save()}
function lockFl(i){lockFlSet(i,!S.floors[i].lk)}
function lockFloor(v){lockFlSet(S.cur,v)}
let sideVisible = true;
function tgSide(forceVal){
  sideVisible = typeof forceVal === 'boolean' ? forceVal : !sideVisible;
  const side = $('side');
  if(side) side.style.display = sideVisible ? '' : 'none';
  rs();
  drawFloors();
  const btnCams = $('btn-cams-side');
  if(btnCams) btnCams.classList.toggle('on', !sideVisible);
  window.parent.postMessage({type:'WMS_PANEL_VISIBILITY_CHANGED',payload:sideVisible},'*');
}
function tgM(){MM=!MM;$('bm').classList.toggle('on',MM)}
function tgHeatmap(val){WMS_HEATMAP = typeof val==='boolean'?val:!WMS_HEATMAP;$('bhm').classList.toggle('on',WMS_HEATMAP);$('ck-hm').checked=WMS_HEATMAP;renderObjs();window.parent.postMessage({type:'WMS_3D_HEATMAP_CHANGED',payload:WMS_HEATMAP},'*')}
function drawFloors(){
 const toggleBtn = '<button id="btn-tg-side" class="' + (!sideVisible ? 'on' : '') + '" onclick="tgSide()" title="' + (sideVisible ? 'Sembunyikan Panel Desain (Tekan H)' : 'Buka Panel Desain (Tekan H)') + '" style="' + (!sideVisible ? 'background:var(--ac);color:#fff;font-weight:700;' : '') + '">' + (sideVisible ? '◀ Sembunyikan' : '🛠️ Panel Desain') + '</button>';
 $('chips').innerHTML=toggleBtn+S.floors.map((f,i)=>\`<button class="\${i===S.cur?'on':''}" onclick="goF(\${i})">Lt \${i+1}\${f.lk?' 🔒':''}</button>\`).join('');
 $('fl-ed').innerHTML=S.floors.map((f,i)=>\`<div class="fr \${i===S.cur?'on':''}"><b onclick="goF(\${i})">Lantai \${i+1}</b>\${['L','W','H'].map((k,j)=>\`<label>\${['P','L','T'][j]}<input type="number" min="1" step="0.5" value="\${f[k]}" \${k==='H'?'oninput':'onchange'}="setF(\${i},'\${k}',this.value)"></label>\`).join('')}<span id="fa\${i}"></span><div class="fx"><label>Lantai<select onchange="setX(\${i},'ft',this.value)">\${[['keramik','Keramik'],['beton','Beton'],['kayu','Kayu'],['epoxy','Epoksi']].map(a=>\`<option value="\${a[0]}"\${(f.ft||'keramik')===a[0]?' selected':''}>\${a[1]}</option>\`).join('')}</select></label><label>Warna<input type="color" value="\${f.fc||'#bdb8b0'}" oninput="setX(\${i},'fc',this.value)"></label><label>Ubin (cm)<input type="number" min="10" step="5" value="\${Math.round((f.fs||.6)*100)}" oninput="setX(\${i},'fs',this.value)"></label></div><div class="fx2"><label>Geser X (m)<input type="number" step="0.5" value="\${+(f.ox||0).toFixed(2)}" onchange="setO(\${i},'ox',this.value)"></label><label>Geser Z (m)<input type="number" step="0.5" value="\${+(f.oz||0).toFixed(2)}" onchange="setO(\${i},'oz',this.value)"></label>\${i>0?\`<button onclick="alignF(\${i},'corner')">Rata kiri-belakang lt.\${i}</button><button onclick="alignF(\${i},'center')">Rata tengah lt.\${i}</button>\`:''}<button style="grid-column:1/3" onclick="lockFl(\${i})">\${f.lk?'Buka kunci semua aset lantai ini':'Kunci semua aset lantai ini'}</button></div></div>\`).join('');areas()}
function areas(){let t=0;S.floors.forEach((f,i)=>{t+=f.L*f.W;const e=$('fa'+i);if(e)e.textContent='Luas '+(f.L*f.W).toFixed(0)+' m²'});$('tot').textContent=\`Total \${t.toFixed(0)} m² · tinggi gedung \${elev(S.floors.length).toFixed(1)} m\`}
function shiftF(i,k,nv){const f=S.floors[i],ov=f[k],d=nv-ov;if(!d)return;const ax=k==='L'?'x':'z',mode=k==='L'?(S.al||'left'):(S.aw||'back'),half=ov/2;
 S.objs.forEach(o=>{if(o.floor!==i)return;const p=+o[ax];let n;if(mode==='center')n=p<-half?p-d/2:p>half?p+d/2:p;else if(mode==='left'||mode==='back')n=p>half?p+d/2:p-d/2;else n=p<-half?p-d/2:p+d/2;o[ax]=+n.toFixed(3)});const ok=k==='L'?'ox':'oz';if(mode==='left'||mode==='back')f[ok]=+((+f[ok]||0)+d/2).toFixed(3);else if(mode==='right'||mode==='front')f[ok]=+((+f[ok]||0)-d/2).toFixed(3)}
function setF(i,k,v){v=parseFloat(v);if(!(v>=1))return;if(k==='L'||k==='W')shiftF(i,k,v);S.floors[i][k]=v;buildB();renderObjs();areas();save()}
function setX(i,k,v){if(k==='fs'){v=parseFloat(v)/100;if(!(v>=.1))return}S.floors[i][k]=v;buildB();save()}
function goF(i){S.cur=i;S.ms=S.ms.filter(id=>{const o=S.objs.find(o=>o.id===id);return o&&o.floor===i});S.sel=S.ms.length?S.ms[S.ms.length-1]:null;oc.target.y=elev(i)+1.5;buildB();renderObjs();drawFloors();drawP();save()}
function addF(){const l=S.floors[S.floors.length-1];S.floors.push(Object.assign({},l));goF(S.floors.length-1)}
function delF(){if(S.floors.length<2)return;const n=S.floors.length-1;S.objs=S.objs.filter(o=>o.floor!==n);S.floors.pop();goF(Math.min(S.cur,n-1))}
function cm(k){const f=S.floors[S.cur],m=Math.max(f.L,f.W),y=elev(S.cur);const fx=fo(S.cur);oc.target.set(fx.x,y+1.5,fx.z);if(k===0)cam.position.set(fx.x+m*.9,y+m*.75,fx.z+m*1.05);else if(k===1)cam.position.set(fx.x,y+m*1.5,fx.z+.01);else cam.position.set(fx.x+m*.45,y+m*.4,fx.z+m*.5);oc.update()}
$('ck-hm').onchange=e=>tgHeatmap(e.target.checked);
$('ck-wtag').onchange=e=>{WMS_SHOW_RACK_TAGS=e.target.checked;renderObjs()};
$('ck-all').onchange=e=>{S.all=e.target.checked;buildB();renderObjs();save()};$('ck-wall').onchange=e=>{S.walls=e.target.checked;buildB();save()};$('ck-cl').onchange=e=>{S.cl=e.target.checked;renderObjs();save()};$('sn').onchange=e=>{S.snap=+e.target.value;save()};
$('al').value=S.al||'left';$('al').onchange=e=>{S.al=e.target.value;persist()};$('aw').value=S.aw||'back';$('aw').onchange=e=>{S.aw=e.target.value;persist()};$('ck-fh').checked=S.fh!==false;$('ck-fh').onchange=e=>{S.fh=e.target.checked;renderObjs();persist()};$('ck-tg').checked=S.tags!==false;$('ck-tg').onchange=e=>{S.tags=e.target.checked;renderObjs();persist()};$('ck-mg').checked=S.mg!==false;$('ck-mg').onchange=e=>{S.mg=e.target.checked;persist();if(!S.mg)clearG()};$('ck-all').checked=S.all;$('ck-wall').checked=S.walls;$('ck-cl').checked=S.cl;$('sn').value=String(S.snap);
$('ex').onclick=()=>{$('ta').value=JSON.stringify({floors:S.floors,objs:S.objs})};
$('im').onclick=()=>{try{const j=JSON.parse($('ta').value);if(!j.floors||!j.objs)return;S.floors=j.floors;S.objs=j.objs;S.uid=Math.max(0,...S.objs.map(o=>o.id))+1;S.gid=Math.max(1,...S.objs.map(o=>(o.gid||0)+1));S.cur=0;S.ms=[];S.sel=null;goF(0);cm(0)}catch(e){$('ta').value='Format tidak valid'}};
// interaksi
let GG=null;
function clearG(){if(GG){sc.remove(GG);disp(GG);GG=null}$('gd').style.display='none'}
function bb(o){const W=o.type==='stairs'?o.w+(+o.s2||3):o.w,Dd=o.d,a=(+o.rot||0)*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a)),hx=c*W/2+s*Dd/2,hz=s*W/2+c*Dd/2;return{x0:o.x-hx,x1:o.x+hx,z0:o.z-hz,z1:o.z+hz}}
function magnet(b,dx,dz,ot,f){const dist=cam.position.distanceTo(oc.target),TH=Math.max(.03,Math.min(.25,6*2*dist*Math.tan(cam.fov*Math.PI/360)/cv.clientHeight));
 const tx=[[-f.L/2,'dinding'],[f.L/2,'dinding']],tz=[[-f.W/2,'dinding'],[f.W/2,'dinding']];
 ot.forEach(o=>{const r=bb(o),n=D[o.type].n;[r.x0,(r.x0+r.x1)/2,r.x1].forEach(v=>tx.push([v,n]));[r.z0,(r.z0+r.z1)/2,r.z1].forEach(v=>tz.push([v,n]))});
 const fit=(lo,hi,d,tg)=>{let best=null;[lo+d,(lo+hi)/2+d,hi+d].forEach(s=>tg.forEach(t=>{const e=t[0]-s;if(Math.abs(e)<TH&&(best===null||Math.abs(e)<Math.abs(best)))best=e}));return best===null?0:best};
 dx+=fit(b.x0,b.x1,dx,tx);dz+=fit(b.z0,b.z1,dz,tz);
 const L=[],names=[],y=elev(S.cur)+.04,gl=(x1,z1,x2,z2)=>L.push(x1,y,z1,x2,y,z2);
 const hit=(lo,hi,d,tg,vert)=>{[lo+d,(lo+hi)/2+d,hi+d].forEach(s=>tg.forEach(t=>{if(Math.abs(t[0]-s)<.01){vert?gl(t[0],-f.W/2,t[0],f.W/2):gl(-f.L/2,t[0],f.L/2,t[0]);names.push(t[1])}}))};
 hit(b.x0,b.x1,dx,tx,1);hit(b.z0,b.z1,dz,tz,0);
 if(GG){sc.remove(GG);disp(GG)}GG=null;
 if(L.length){GG=new T.Group();const gm=new T.BufferGeometry();gm.setAttribute('position',new T.Float32BufferAttribute(L,3));const ln=new T.LineSegments(gm,new T.LineBasicMaterial({color:0xff00aa,depthTest:false,transparent:true}));ln.renderOrder=9;GG.add(ln);sc.add(GG)}
 const l=b.x0+dx+f.L/2,r=f.L/2-(b.x1+dx),bk=b.z0+dz+f.W/2,fr=f.W/2-(b.z1+dz),el=$('gd');el.style.display='block';
 el.textContent=(names.length?'Sejajar dengan: '+[...new Set(names)].join(', ')+'  |  ':'')+\`Jarak ke dinding: kiri \${l.toFixed(2)} · kanan \${r.toFixed(2)} · belakang \${bk.toFixed(2)} · depan \${fr.toFixed(2)} m\`;
 return{dx,dz}}
function addHandles(o){const e0=elev(o.floor)+(+o.y||0),W=o.type==='stairs'?o.w+(+o.s2||3):o.w,a=(+o.rot||0)*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),sz=Math.max(.12,Math.min(.5,cam.position.distanceTo(oc.target)*.012)),yy=e0+Math.min(+o.h||.1,.6)/2+.05,of=sz*.7;
 const m1=(col,lx,lz,y,d)=>{const m=new T.Mesh(new T.BoxGeometry(sz,sz,sz),new T.MeshBasicMaterial({color:col,depthTest:false,transparent:true,opacity:.95}));m.position.set(o.x+lx*cs+lz*sn+fo(o.floor).x,y,o.z-lx*sn+lz*cs+fo(o.floor).z);m.renderOrder=10;m.userData.hd=d;HG.add(m)};
 m1(0xff8a1f,W/2+of,0,yy,{a:'x',s:1});m1(0xff8a1f,-W/2-of,0,yy,{a:'x',s:-1});m1(0x2f9bff,0,o.d/2+of,yy,{a:'z',s:1});m1(0x2f9bff,0,-o.d/2-of,yy,{a:'z',s:-1});
 if(o.type!=='zone')m1(0x2fc46a,0,0,e0+(+o.h)+sz,{a:'h',s:1})}
function magFloor(nx,nz,f){const dist=cam.position.distanceTo(oc.target),TH=Math.max(.05,Math.min(.4,6*2*dist*Math.tan(cam.fov*Math.PI/360)/cv.clientHeight)),tx=[],tz=[];
 S.floors.forEach((g,j)=>{if(j===S.cur)return;const ox=+g.ox||0,oz=+g.oz||0;[ox-g.L/2,ox,ox+g.L/2].forEach(v=>tx.push([v,j+1]));[oz-g.W/2,oz,oz+g.W/2].forEach(v=>tz.push([v,j+1]))});
 const fit=(c,half,tg)=>{let best=null,nj=null;[c-half,c,c+half].forEach(s=>tg.forEach(t=>{const d=t[0]-s;if(Math.abs(d)<TH&&(best===null||Math.abs(d)<Math.abs(best))){best=d;nj=t[1]}}));return[best||0,nj]};
 const ax=fit(nx,f.L/2,tx),az=fit(nz,f.W/2,tz),names=[];if(ax[1])names.push('lantai '+ax[1]);if(az[1]&&az[1]!==ax[1])names.push('lantai '+az[1]);return{x:nx+ax[0],z:nz+az[0],names}}
function setO(i,k,v){v=parseFloat(v);if(isNaN(v))return;S.floors[i][k]=v;buildB();renderObjs();save()}
function alignF(i,mode){const a=S.floors[i-1],f=S.floors[i];if(!a)return;if(mode==='center'){f.ox=a.ox||0;f.oz=a.oz||0}else{f.ox=+((a.ox||0)-a.L/2+f.L/2).toFixed(3);f.oz=+((a.oz||0)-a.W/2+f.W/2).toFixed(3)}buildB();renderObjs();drawFloors();save()}
let fz=null,fq=0;const rqFloor=()=>{if(fq)return;fq=requestAnimationFrame(()=>{fq=0;buildB();syncPos();refreshFH()})};
const mapP=(p,half,d,mode)=>(mode==='left'||mode==='back')?(p>half?p+d/2:p-d/2):(p<-half?p-d/2:p+d/2);
function addFH(){const f=S.floors[S.cur],e0=elev(S.cur),sz=Math.max(.25,Math.min(.9,cam.position.distanceTo(oc.target)*.016));
 [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].forEach(a=>{const m=new T.Mesh(new T.BoxGeometry(sz,sz*.6,sz),new T.MeshBasicMaterial({color:a[0]&&a[1]?0xd946ef:0x8b5cf6,depthTest:false,transparent:true,opacity:.95}));m.position.set(a[0]*f.L/2+fo(S.cur).x,e0+.15,a[1]*f.W/2+fo(S.cur).z);m.renderOrder=10;m.userData.fh={sx:a[0],sz:a[1]};FH.add(m)});const mc=new T.Mesh(new T.BoxGeometry(sz,sz*.6,sz),new T.MeshBasicMaterial({color:0xffffff,depthTest:false,transparent:true,opacity:.9}));mc.position.set(fo(S.cur).x,e0+.15,fo(S.cur).z);mc.renderOrder=10;mc.userData.fh={mv:1};FH.add(mc)}
function startFloor(e,h){const f=S.floors[S.cur],tc=cam.clone();tc.updateMatrixWorld(true);const pl=new T.Plane(new T.Vector3(0,1,0),-elev(S.cur)),p=new T.Vector3();ray.setFromCamera(mv,tc);if(!ray.ray.intersectPlane(pl,p))return;
 fz={sx:h.sx,sz:h.sz,mv:h.mv,ox0:f.ox||0,oz0:f.oz||0,L0:f.L,W0:f.W,tc,pl,p0:p.clone(),c0:cam.position.clone(),t0:oc.target.clone(),objs:S.objs.filter(o=>o.floor===S.cur).map(o=>({o,x:o.x,z:o.z}))};oc.enabled=false;try{cv.setPointerCapture(e.pointerId)}catch(x){}}
function doFloor(e){const z=fz,rc=cv.getBoundingClientRect();mv.set((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1);ray.setFromCamera(mv,z.tc);const p=new T.Vector3();if(!ray.ray.intersectPlane(z.pl,p))return;
if(z.mv){const q2=S.snap>0?S.snap:.05,sn2=v=>Math.round(v/q2)*q2,fm=S.floors[S.cur],mg=magFloor(sn2(z.ox0+p.x-z.p0.x),sn2(z.oz0+p.z-z.p0.z),fm);fm.ox=+mg.x.toFixed(3);fm.oz=+mg.z.toFixed(3);const el2=$('gd');el2.style.display='block';el2.textContent='Posisi lantai: X '+fm.ox.toFixed(2)+' · Z '+fm.oz.toFixed(2)+' m'+(mg.names.length?'  |  Sejajar dengan '+mg.names.join(', '):'');rqFloor();return}
 const q=S.snap>0?Math.max(S.snap,.1):.1,sn=v=>Math.round(v/q)*q,f=S.floors[S.cur];let shx=0,shz=0;
 if(z.sx){const L=Math.max(2,+(z.L0+sn(z.sx*(p.x-z.p0.x))).toFixed(3)),d=L-z.L0,mode=z.sx>0?'left':'right';f.L=L;z.objs.forEach(a=>{a.o.x=+mapP(a.x,z.L0/2,d,mode).toFixed(3)});shx=mode==='left'?-d/2:d/2}
 if(z.sz){const W=Math.max(2,+(z.W0+sn(z.sz*(p.z-z.p0.z))).toFixed(3)),d=W-z.W0,mode=z.sz>0?'back':'front';f.W=W;z.objs.forEach(a=>{a.o.z=+mapP(a.z,z.W0/2,d,mode).toFixed(3)});shz=mode==='back'?-d/2:d/2}
 f.ox=+((z.ox0||0)-shx).toFixed(3);f.oz=+((z.oz0||0)-shz).toFixed(3);
 const el=$('gd');el.style.display='block';el.textContent=\`Area lantai \${f.L.toFixed(1)} × \${f.W.toFixed(1)} m = \${(f.L*f.W).toFixed(0)} m²\`;rqFloor()}
function endFloor(){fz=null;oc.enabled=true;$('gd').style.display='none';drawFloors();renderObjs();save()}
function syncPos(){OG.children.forEach(g=>{const o=S.objs.find(p=>p.id===g.userData.id);if(o){g.position.x=o.x+fo(o.floor).x;g.position.z=o.z+fo(o.floor).z}});TG.children.forEach(s=>{const o=S.objs.find(p=>p.id===s.userData.id);if(o){s.position.x=o.x+fo(o.floor).x;s.position.z=o.z+fo(o.floor).z}});BHs.forEach(b=>b.update())}
function refreshFH(){sc.remove(FH);disp(FH);FH=new T.Group();sc.add(FH);if(!S.ms.length&&S.fh!==false)addFH()}
function rebuildOne(o){dirty=1;const old=OG.children.find(g=>g.userData.id===o.id);if(!old){renderObjs();return}
 OG.remove(old);disp(old);const g=mk(o);OG.add(g);const sp=TG.children.find(s=>s.userData.id===o.id);if(sp)sp.position.set(o.x+fo(o.floor).x,elev(o.floor)+(+o.y||0)+(o.type==='zone'?.05:+o.h)+.3,o.z+fo(o.floor).z);
 BHs.forEach(b=>{sc.remove(b);b.geometry.dispose();b.material.dispose()});BHs=[];if(S.ms.includes(o.id)){const b=new T.BoxHelper(g,o.lk?0x888888:0xff6a00);BHs.push(b);sc.add(b)}
 sc.remove(HG);disp(HG);HG=new T.Group();sc.add(HG);if(S.ms.length===1&&!o.lk)addHandles(o);if(ssig()!==SSig)buildB();drawIC()}
function showG(L,txt){if(GG){sc.remove(GG);disp(GG)}GG=null;if(L.length){GG=new T.Group();const gm=new T.BufferGeometry();gm.setAttribute('position',new T.Float32BufferAttribute(L,3));const ln=new T.LineSegments(gm,new T.LineBasicMaterial({color:0xff00aa,depthTest:false,transparent:true}));ln.renderOrder=9;GG.add(ln);sc.add(GG)}const el=$('gd');el.style.display='block';el.textContent=txt}
function magSize(o,hd,r,nv){const a=(+o.rot||0)*Math.PI/180,cs=Math.round(Math.cos(a)),sn=Math.round(Math.sin(a)),dir=hd.a==='x'?[cs,-sn]:[sn,cs],ax=dir[0]?0:1,sg=hd.s*dir[ax],base=hd.a==='x'?r.w0:r.d0,c0=ax?r.z0:r.x0,fe=c0-sg*base/2,f=S.floors[o.floor];
 const tg=ax?[[-f.W/2,'dinding'],[f.W/2,'dinding']]:[[-f.L/2,'dinding'],[f.L/2,'dinding']];
 S.objs.forEach(q=>{if(q.id===o.id||q.floor!==o.floor||q.type==='zone')return;const b=bb(q),lo=ax?b.z0:b.x0,hi=ax?b.z1:b.x1,n=D[q.type]?D[q.type].n:q.type;tg.push([lo,n],[(lo+hi)/2,n],[hi,n])});
 const dist=cam.position.distanceTo(oc.target),TH=Math.max(.03,Math.min(.25,6*2*dist*Math.tan(cam.fov*Math.PI/360)/cv.clientHeight));
 let e=fe+sg*nv,best=null;tg.forEach(t=>{const d=t[0]-e;if(Math.abs(d)<TH&&(best===null||Math.abs(d)<Math.abs(best)))best=d});
 if(best!==null){nv=Math.max(.05,nv+sg*best);e=fe+sg*nv}
 const L=[],names=[],y=elev(o.floor)+.04;tg.forEach(t=>{if(Math.abs(t[0]-e)<.01){if(ax)L.push(-f.L/2,y,t[0],f.L/2,y,t[0]);else L.push(t[0],y,-f.W/2,t[0],y,f.W/2);names.push(t[1])}});
 showG(L,(hd.a==='x'?'Panjang ':'Lebar ')+nv.toFixed(2)+' m'+(names.length?'  |  Sejajar dengan: '+[...new Set(names)].join(', '):''));return nv}
let rq=0;const rqRender=o=>{if(rq)return;rq=requestAnimationFrame(()=>{rq=0;rebuildOne(o)})};
function doResize(e){const r=rz,o=r.o,hd=r.hd,q=S.snap,s0=v=>q?Math.round(v/q)*q:v;
 if(hd.a==='h'){const dist=cam.position.distanceTo(oc.target),mpp=2*dist*Math.tan(cam.fov*Math.PI/360)/cv.clientHeight;o.h=Math.max(.02,s0(r.h0-(e.clientY-r.y0)*mpp))}
 else{setM(e);const p=new T.Vector3();if(!ray.ray.intersectPlane(r.pl,p))return;const dx=p.x-r.p0.x,dz=p.z-r.p0.z,dl=hd.a==='x'?dx*r.cs-dz*r.sn:dx*r.sn+dz*r.cs,st=o.type==='stairs'&&hd.a==='x',base=hd.a==='x'?(st?r.s0:r.w0):r.d0,nv0=Math.max(st?.5:.05,s0(base+hd.s*dl));let nv=nv0;if(S.mg!==false&&!e.altKey&&!st&&o.type!=='koli'&&(+o.rot||0)%90===0)nv=magSize(o,hd,r,nv0);else clearG();const dS=nv-base;
  if(hd.a==='x'){if(st)o.s2=nv;else o.w=nv}else o.d=nv;const sh=hd.s*dS/2;if(hd.a==='x'){o.x=r.x0+sh*r.cs;o.z=r.z0-sh*r.sn}else{o.x=r.x0+sh*r.sn;o.z=r.z0+sh*r.cs}}if(o.type==='koli'){koliNorm(o);o.nx=Math.max(1,Math.min(50,Math.round(o.w/o.kw)));o.nz=Math.max(1,Math.min(50,Math.round(o.d/o.kd)));o.ny=Math.max(1,Math.min(50,Math.round(o.h/o.kh)));o.w=o.nx*o.kw;o.d=o.nz*o.kd;o.h=o.ny*o.kh}
 rqRender(o)}
const EXT=15;
const SUP=['shelf','sewrack','shoerack','table','bench','rack','koli'];
function putOn(o){const L=S.objs.filter(q=>q.floor===o.floor&&q.id!==o.id&&['shelf','sewrack','shoerack','table','bench','rack'].includes(q.type));if(!L.length)return '';
 return \`<label class="full">Taruh di atas aset<select id="putT"><option value="">(pilih rak/meja)</option>\${L.map(q=>\`<option value="\${q.id}">\${esc(q.tg||q.n)} · \${q.x.toFixed(1)}, \${q.z.toFixed(1)}</option>\`).join('')}</select></label><label>Tingkat (99 = paling atas)<input id="putL" type="number" min="1" step="1" value="99"></label><label>&nbsp;<button onclick="putSel()">Taruh</button></label>\`}
function putSel(){const o=cur();if(!o||!['koli','laptop','printer'].includes(o.type)||o.lk)return;const id=+$('putT').value;if(!id)return;const q=S.objs.find(p=>p.id===id);if(!q)return;const L=levels(q),n=Math.max(1,Math.min(L.length,Math.round(+$('putL').value||L.length))),lv=L[n-1];
 const k=S.objs.filter(p=>p.type==='koli'&&p.id!==o.id&&p.floor===o.floor&&Math.abs(elev(p.floor)+(+p.y||0)-lv)<.02&&Math.abs(p.x-q.x)<q.w&&Math.abs(p.z-q.z)<q.w).length,cols=Math.max(1,Math.floor(q.w/o.w)),a=(+q.rot||0)*Math.PI/180,lx=-q.w/2+o.w/2+(k%cols)*o.w;
 o.x=+(q.x+lx*Math.cos(a)).toFixed(3);o.z=+(q.z-lx*Math.sin(a)).toFixed(3);o.y=+(lv-elev(o.floor)).toFixed(3);o.rot=q.rot||0;renderObjs();drawP();save()}
function levels(q){const b=elev(q.floor)+(+q.y||0);if(q.type==='shelf'||q.type==='sewrack'||q.type==='shoerack'){const lv=Math.max(2,q.lv|0),gp=(q.h-.03)/(lv-1),th=q.type==='shoerack'?.025:.03;return Array.from({length:lv},(_,i)=>b+i*gp+th)}return[b+(+q.h)]}
function surfDrag(e){const o=drag.it[0].o;setM(e);
 const gs=OG.children.filter(g=>{const q=S.objs.find(p=>p.id===g.userData.id);return q&&q.floor===o.floor&&q.id!==o.id&&SUP.includes(q.type)}),hit=ray.intersectObjects(gs,true).filter(q=>!q.object.userData.np)[0],gr=OG.children.find(g=>g.userData.id===o.id);
 if(!hit){if(o.y){o.y=0;if(gr)gr.position.y=elev(o.floor)}return false}
 let g=hit.object;while(g&&!g.userData.id)g=g.parent;const q=S.objs.find(p=>p.id===g.userData.id),L=levels(q);let lv=L[0];L.forEach(v=>{if(v<=hit.point.y+.03)lv=v});
 const p=new T.Vector3();if(!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-lv),p))return false;
 const qs=S.snap,sn=v=>qs?Math.round(v/qs)*qs:v;o.x=sn(p.x-fo(o.floor).x);o.z=sn(p.z-fo(o.floor).z);o.y=+(lv-elev(o.floor)).toFixed(3);
 if(gr)gr.position.set(o.x+fo(o.floor).x,lv,o.z+fo(o.floor).z);const sp=TG.children.find(s=>s.userData.id===o.id);if(sp){sp.position.x=o.x+fo(o.floor).x;sp.position.z=o.z+fo(o.floor).z;sp.position.y=lv+(+o.h)+.3}
 clearG();BHs.forEach(b=>b.update());return true}
const ray=new T.Raycaster(),mv=new T.Vector2();let drag=null,dn=null,MM=false,rz=null;
const setM=e=>{const r=cv.getBoundingClientRect();mv.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(mv,cam)};
cv.addEventListener('pointerdown',e=>{if(e.button!==0)return;setM(e);dn={x:e.clientX,y:e.clientY};
 const fh0=ray.intersectObjects(FH.children,false)[0];if(fh0&&fh0.object.userData.fh){startFloor(e,fh0.object.userData.fh);dn.hit=true;return}const hh=ray.intersectObjects(HG.children,false)[0];if(hh&&hh.object.userData.hd){const o=cur();if(o&&!o.lk){const pl=new T.Plane(new T.Vector3(0,1,0),-elev(o.floor)),p=new T.Vector3(),a=(+o.rot||0)*Math.PI/180;ray.ray.intersectPlane(pl,p);rz={o,hd:hh.object.userData.hd,pl,p0:p.clone(),y0:e.clientY,w0:o.w,d0:o.d,h0:+o.h,s0:+o.s2||3,x0:o.x,z0:o.z,cs:Math.cos(a),sn:Math.sin(a)};oc.enabled=false;dn.hit=true;return}}
 const gs=OG.children.filter(g=>S.objs.find(o=>o.id===g.userData.id).floor===S.cur),hit=ray.intersectObjects(gs,true).filter(q=>!q.object.userData.np)[0];
 if(hit){let g=hit.object;while(!g.userData.id)g=g.parent;dn.hit=true;const id=g.userData.id,add=e.shiftKey||e.ctrlKey||e.metaKey||MM;if(add)select(id,true);else if(!S.ms.includes(id))select(id);const p=new T.Vector3(),pl=new T.Plane(new T.Vector3(0,1,0),-elev(S.cur));
  if(!add&&S.ms.includes(id)&&ray.ray.intersectPlane(pl,p)){const it=S.objs.filter(o=>S.ms.includes(o.id)&&!o.lk).map(o=>({o,x:o.x,z:o.z}));if(!it.length){const el=$('gd');el.style.display='block';el.textContent='Aset terkunci. Buka kunci di panel Properti (atau tekan L) untuk memindah.';setTimeout(()=>{if(!drag)el.style.display='none'},1800);return}const rr=it.map(a=>bb(a.o)),bb0={x0:Math.min(...rr.map(r=>r.x0)),x1:Math.max(...rr.map(r=>r.x1)),z0:Math.min(...rr.map(r=>r.z0)),z1:Math.max(...rr.map(r=>r.z1))};drag={pl,p0:p.clone(),it,sf:it.length===1&&['koli','laptop','printer'].includes(it[0].o.type),bb:bb0,ot:S.objs.filter(o=>o.floor===S.cur&&o.type!=='zone'&&!S.ms.includes(o.id))};oc.enabled=false;HG.visible=false}}});
cv.addEventListener('pointermove',e=>{if(fz){doFloor(e);return}if(rz){doResize(e);return}if(!drag)return;dirty=1;if(drag.sf&&surfDrag(e))return;setM(e);const p=new T.Vector3();if(!ray.ray.intersectPlane(drag.pl,p))return;const q=S.snap,sn=v=>q?Math.round(v/q)*q:v;let dx=p.x-drag.p0.x,dz=p.z-drag.p0.z;const pr=drag.it.find(a=>a.o.id===S.sel)||drag.it[0];dx=sn(pr.x+dx)-pr.x;dz=sn(pr.z+dz)-pr.z;if(S.mg!==false&&!e.altKey&&drag.bb){const r=magnet(drag.bb,dx,dz,drag.ot,S.floors[S.cur]);dx=r.dx;dz=r.dz}else clearG();
 drag.it.forEach(a=>{const f=S.floors[a.o.floor];a.o.x=Math.max(-f.L/2-EXT,Math.min(f.L/2+EXT,a.x+dx));a.o.z=Math.max(-f.W/2-EXT,Math.min(f.W/2+EXT,a.z+dz));const g=OG.children.find(g=>g.userData.id===a.o.id);if(g){g.position.x=a.o.x+fo(a.o.floor).x;g.position.z=a.o.z+fo(a.o.floor).z}const sp=TG.children.find(s=>s.userData.id===a.o.id);if(sp){sp.position.x=a.o.x+fo(a.o.floor).x;sp.position.z=a.o.z+fo(a.o.floor).z}});
 BHs.forEach(b=>b.update())});
addEventListener('pointerup',e=>{if(fz){endFloor();dn=null;return}if(rz){rz=null;oc.enabled=true;clearG();renderObjs();drawP();save();dn=null;return}if(drag){drag=null;oc.enabled=true;clearG();renderObjs();drawP();save()}else if(dn&&!dn.hit&&Math.hypot(e.clientX-dn.x,e.clientY-dn.y)<4&&e.target===cv&&S.ms.length){select(null)}dn=null});
cv.addEventListener('dblclick',e=>{setM(e);const gs=OG.children.filter(g=>{const q=S.objs.find(o=>o.id===g.userData.id);return q&&q.floor===S.cur}),hit=ray.intersectObjects(gs,true).filter(q=>!q.object.userData.np)[0];if(!hit)return;let g=hit.object;while(g&&!g.userData.id)g=g.parent;if(g)setSel([g.userData.id])});
addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const k=e.key.toLowerCase(),m=e.ctrlKey||e.metaKey;if(m&&k==='z'){e.preventDefault();e.shiftKey?redo():undo()}else if(m&&k==='y'){e.preventDefault();redo()}else if(m&&k==='a'){e.preventDefault();selAll()}else if(m&&k==='g'){e.preventDefault();e.shiftKey?ungrp():mkgrp()}else if(m)return;else if(k.startsWith('arrow')){e.preventDefault();nudge(k,e)}else if(k==='delete'||k==='backspace')del();else if(k==='r')rot();else if(k==='l'){const a=S.objs.filter(o=>S.ms.includes(o.id));if(a.length)tgLock(!a.every(o=>o.lk))}else if(k==='h'){e.preventDefault();tgSide()}else if(k==='escape')select(null)});
const isDark=()=>S.th==='dark'||(S.th!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme(){inv();const r=document.documentElement;if(S.th==='light'||S.th==='dark')r.setAttribute('data-theme',S.th);else r.removeAttribute('data-theme');const d=isDark(),bg=d?0x0b1324:0xdde5ea;sc.background.set(bg);sc.fog.color.set(bg);gnd.material.color.set(d?0x161f30:0xb9c2a8);hemi.intensity=d?.5:.85;sun.intensity=d?.75:1.1;sun.color.set(d?0xcfd8ff:0xfff2de);R.toneMappingExposure=d?.95:1;$('bt').textContent='Tema: '+({auto:'Otomatis',light:'Terang',dark:'Gelap'})[S.th]}
function openWmsLocModal(loc){
  window.parent.postMessage({type:'WMS_3D_OPEN_LOC_MODAL',payload:loc},'*');
}
function drawIC(){const el=$('ic'),o=S.ms.length===1?cur():null;if(!o||!D[o.type]){el.style.display='none';return}
 const m=[\`\${(+o.w).toFixed(2)} × \${(+o.d).toFixed(2)} × \${(+o.h).toFixed(2)} m\`];
 if(o.type==='koli')m.push((o.nx||1)*(o.nz||1)*(o.ny||1)+' koli');else if(KS.includes(o.type)&&o.kl)m.push(koliN(o)+' koli (kapasitas '+koliCap(o).tot+')');
 if(o.lk)m.push('Terkunci');
 const ws = getObjWmsStats(o);
 let wmsHtml = '';
 if(ws){
   const perRackHtml = ws.codes.slice(0,8).map(c=>{
     const sl = WMS_SLOTS[c];
     const q = sl ? sl.currentQty : 0;
     const cap = sl ? sl.maxCapacity : 25;
     const p = cap > 0 ? Math.round((q/cap)*100) : 0;
     const cl = p>=100?'#ef4444':p>=80?'#f59e0b':q>0?'#10b981':'#94a3b8';
     return \`<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px dashed rgba(148,163,184,.2);font-family:monospace;font-size:11px"><span style="cursor:pointer;text-decoration:underline;font-weight:700" onclick="openWmsLocModal('\${esc(c)}')">📍 \${esc(c)}</span><span style="color:\${cl};font-weight:700">\${q}/\${cap} pcs (\${p}%)</span></div>\`;
   }).join('');
   const firstCode = ws.codes[0] || '';
   wmsHtml = \`<div class="wms-box"><div style="display:flex;justify-content:space-between;align-items:center"><b>Rak WMS: \${esc(ws.code)}</b><span style="color:\${ws.col};font-weight:800;font-family:monospace">\${ws.curQty}/\${ws.maxCap} pcs (\${ws.pct}%)</span></div><div class="wms-bar"><div class="wms-bar-fill" style="width:\${Math.min(100,ws.pct)}%;background:\${ws.col}"></div></div><div style="max-height:95px;overflow:auto;margin-top:4px">\${perRackHtml}</div>\${firstCode?\`<button style="width:100%;margin-top:6px;background:var(--ac);color:#fff;border:0;padding:5px;border-radius:6px;font-size:11px" onclick="openWmsLocModal('\${esc(firstCode)}')">🖨️ Detail &amp; Cetak Rak (\${esc(firstCode)})</button>\`:''}</div>\`;
 }
 el.innerHTML=\`<div class="ict"><div style="display:flex;align-items:center;gap:7px"><span class="icd" style="background:\${esc(ws?ws.col:(o.tc||'#6366f1'))}"></span><b>\${esc(o.tg||o.n)}</b></div>\${ws?\`<span style="font-family:monospace;font-size:11px;font-weight:800;color:\${ws.col}">\${ws.pct}%</span>\`:''}</div><div class="ics">\${esc(D[o.type].n)}\${o.wmsCode?' · Rak '+esc(o.wmsCode):''} · Lantai \${o.floor+1}</div>\${wmsHtml}\${o.ds?\`<div class="icb">\${esc(o.ds).split('\\n').join('<br>')}</div>\`:''}<div class="icm">\${m.map(x=>\`<span>\${x}</span>\`).join('')}</div>\`;el.style.display='block'}
function note(m){const el=$('gd');el.style.display='block';el.textContent=m;setTimeout(()=>{el.style.display='none'},4000)}
async function dl(name,data){try{
 const b=data instanceof Blob?data:new Blob([data]),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)}catch(e){note('Gagal mengunduh. Salin lewat kotak Ekspor teks di sidebar.')}}
const dataJ=()=>JSON.stringify({app:'gudang-3d',floors:S.floors,objs:S.objs},null,1);
function dlJson(){dl('layout-gudang.json',dataJ())}
function dlPng(){R.render(sc,cam);cv.toBlob(b=>{if(b)dl('gudang-3d.png',b);else note('Gagal membuat gambar.')},'image/png')}
function dlCsv(){const q=v=>'"'+String(v==null?'':v).split('"').join('""')+'"',H=['Lantai','Jenis','Nama','Kode Rak WMS','Penanda','X (m)','Z (m)','Tinggi dari lantai (m)','Panjang (m)','Lebar (m)','Tinggi (m)','Rotasi','Terkunci','Jumlah koli','Stok Live WMS','Kapasitas WMS','Deskripsi'],
 R=S.objs.slice().sort((a,b)=>a.floor-b.floor).map(o=>{const kn=o.type==='koli'?(o.nx||1)*(o.nz||1)*(o.ny||1):(KS.includes(o.type)&&o.kl?koliN(o):'');const ws=getObjWmsStats(o);return[o.floor+1,D[o.type]?D[o.type].n:o.type,o.n,o.wmsCode||'',o.tg||'',(+o.x).toFixed(2),(+o.z).toFixed(2),(+o.y||0).toFixed(2),(+o.w).toFixed(2),(+o.d).toFixed(2),(+o.h).toFixed(2),o.rot||0,o.lk?'Ya':'',kn,ws?ws.curQty:'',ws?ws.maxCap:'',o.ds||'']});
 dl('daftar-aset-gudang.csv','\\uFEFF'+[H].concat(R).map(r=>r.map(q).join(',')).join('\\n'))}
async function dlHtml(){try{const c=document.documentElement.cloneNode(true);
 c.querySelectorAll('script').forEach(s=>{const src=s.getAttribute('src')||'';const ok=src?(src.startsWith('https://cdnjs.cloudflare.com/')||src.startsWith('https://cdn.jsdelivr.net/')):s.textContent.includes('wms3d');if(!ok)s.remove()});
 c.querySelectorAll('meta[http-equiv],base').forEach(e=>e.remove());
 const main=[...c.querySelectorAll('script:not([src])')].find(s=>s.textContent.includes('wms3d'));if(!main){note('Gagal membuat file HTML.');return}
 const sd=document.createElement('script');sd.textContent='window.__SEED='+JSON.stringify(JSON.stringify(S)).split('<').join('\\\\u003c')+';';main.parentNode.insertBefore(sd,main);
 await dl('gudang-3d-dengan-data.html','<!DOCTYPE html>\\n'+c.outerHTML)}catch(e){note('Gagal membuat file HTML.')}}
function impJ(t){try{const j=JSON.parse(t);if(!Array.isArray(j.floors)||!Array.isArray(j.objs))throw 0;S.floors=j.floors;S.objs=j.objs;autoMapWmsCodesToObjs(S.objs);S.uid=Math.max(0,...S.objs.map(o=>o.id))+1;S.gid=Math.max(1,...S.objs.map(o=>(o.gid||0)+1));S.cur=0;S.ms=[];S.sel=null;goF(0);cm(0);note('Data dimuat: '+S.objs.length+' aset.')}catch(e){note('File data tidak valid.')}}
$('fi').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>impJ(r.result);r.readAsText(f);e.target.value=''};
function cycTheme(){S.th={auto:'light',light:'dark',dark:'auto'}[S.th]||'auto';applyTheme();persist()}

// Listen for messages from React parent (Live WMS Capacity Sync, Heatmap toggle, Auto-Map, Reset)
window.addEventListener('message',e=>{
  const d=e.data;
  if(!d||!d.type)return;
  if(d.type==='WMS_SYNC_CAPACITY'){
    WMS_SLOTS = d.payload || {};
    renderObjs();
    drawP();
  } else if(d.type==='WMS_SET_HEATMAP'){
    tgHeatmap(Boolean(d.payload));
  } else if(d.type==='WMS_SET_PRESENTATION_MODE'){
    const isP = Boolean(d.payload);
    const side = $('side'), chips = $('chips'), cams = $('cams'), hint = $('hint'), bhm = $('bhm'), gd = $('gd');
    if(side) side.style.display = isP ? 'none' : (sideVisible ? '' : 'none');
    if(chips) chips.style.display = isP ? 'none' : '';
    if(cams) cams.style.display = isP ? 'none' : '';
    if(hint) hint.style.display = isP ? 'none' : '';
    if(bhm) bhm.style.display = isP ? 'none' : '';
    if(gd) gd.style.display = 'none';
    rs();
  } else if(d.type==='WMS_SET_PANEL_VISIBILITY'){
    tgSide(Boolean(d.payload));
  } else if(d.type==='WMS_TOGGLE_PANEL_VISIBILITY'){
    tgSide();
  } else if(d.type==='WMS_SET_AUTO_ROTATE'){
    oc.autoRotate = Boolean(d.payload);
    oc.autoRotateSpeed = 1.35;
    dirty = 1;
  } else if(d.type==='WMS_SET_CAMERA_PRESET'){
    cm(Number(d.payload));
    dirty = 1;
  } else if(d.type==='WMS_SET_ACTIVE_FLOOR'){
    if(d.payload === 'ALL'){
      S.all = true;
      buildB();
      renderObjs();
      cm(0);
    } else {
      S.all = false;
      const fl = Math.max(0, Math.min(S.floors.length - 1, Number(d.payload)));
      goF(fl);
      cm(0);
    }
  } else if(d.type==='WMS_SET_SHOW_TAGS'){
    const show = Boolean(d.payload);
    WMS_SHOW_RACK_TAGS = show;
    S.tags = show;
    const cw = $('ck-wtag'), ct = $('ck-tg');
    if(cw) cw.checked = show;
    if(ct) ct.checked = show;
    renderObjs();
    persist();
  } else if(d.type==='WMS_AUTO_MAP_RACKS'){
    S.objs.forEach(o=>{delete o.wmsCode});
    autoMapWmsCodesToObjs(S.objs);
    renderObjs();
    drawP();
    save('automap');
    note('✅ Seluruh rak 3D berhasil dipetakan ke kode rak Gudang WMS (A, B, C, D, R, V, Z, Studio)!');
  } else if(d.type==='WMS_LOAD_CLOUD_STATE'){
    try{
      const parsed=typeof d.payload==='string'?JSON.parse(d.payload):d.payload;
      if(parsed && Array.isArray(parsed.floors) && Array.isArray(parsed.objs)){
        S=Object.assign(S,parsed);
        autoMapWmsCodesToObjs(S.objs);
        S.sel=null;S.ms=[];
        buildB();renderObjs();drawFloors();drawP();
        localStorage.setItem('${LOCAL_STORAGE_3D_KEY}',JSON.stringify(S));
      }
    }catch(err){}
  } else if(d.type==='WMS_RESET_SEED'){
    try{
      const seed = getInitialSeed();
      S=Object.assign(S, JSON.parse(JSON.stringify(seed)));
      autoMapWmsCodesToObjs(S.objs);
      S.sel=null;S.ms=[];
      buildB();renderObjs();drawFloors();drawP();save('reset');
      note('Layout 3D dikembalikan ke rancangan awal gedung 4 lantai.');
    }catch(err){}
  }
});

try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(S.th==='auto')applyTheme()})}catch(e){}
function rs(){inv();const v=$('view');R.setSize(v.clientWidth,v.clientHeight,false);cam.aspect=v.clientWidth/v.clientHeight;cam.updateProjectionMatrix()}
new ResizeObserver(rs).observe($('view'));
drawFloors();buildB();renderObjs();drawP();rs();cm(0);pushH();applyTheme();
window.parent.postMessage({type:'WMS_3D_READY'},'*');
(function loop(){requestAnimationFrame(loop);const ch=oc.update();if(ch||dirty||oc.autoRotate){dirty=0;if(GG)GG.position.set(fo(S.cur).x,0,fo(S.cur).z);R.render(sc,cam)}})();
</script>
</body></html>`;
}

export const Warehouse3DVisualTab: React.FC<Warehouse3DVisualTabProps> = ({
  stockRows,
  productCatalog = [],
  session,
  onNotify,
  onOpenPrintModal,
  onRefreshStock,
  isRefreshingStock,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [config, setConfig] = useState<RackCapacityConfig>(() => loadLocalRackCapacityConfig());
  const [heatmapActive, setHeatmapActive] = useState(false);
  const [showTags, setShowTags] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidePanelHidden, setIsSidePanelHidden] = useState(false);
  const [isPresentation, setIsPresentation] = useState(false);
  const [isAutoRotate, setIsAutoRotate] = useState(false);
  const [activeFloor, setActiveFloor] = useState<'ALL' | number>('ALL');
  const [activeCameraPreset, setActiveCameraPreset] = useState<number>(0);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [selectedRackInfo, setSelectedRackInfo] = useState<Selected3DRackInfo | null>(null);
  const latest3DStateRef = useRef<string | null>(null);

  // Load latest rack capacity config from Supabase
  useEffect(() => {
    let mounted = true;
    fetchRackCapacityConfig()
      .then((remoteConfig) => {
        if (mounted && remoteConfig) setConfig(remoteConfig);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Build Master Produk lookup map
  const catalogMap = useMemo(() => {
    const map = new Map<string, EnrichedCatalogEntry>();
    for (let i = 0; i < productCatalog.length; i++) {
      const item = productCatalog[i];
      if (!item) continue;
      const rawSku = String(item.sku || item.k || '').trim().toUpperCase();
      if (!rawSku) continue;
      const rawName = String(item.nama_produk || item.p || rawSku || '');
      const rawSize = String(item.size || item.s || (extractSizeFromSku(rawSku) !== '-' ? extractSizeFromSku(rawSku) : '-'));
      const cleanedName = cleanProductName(rawName);
      const cleanedSize = extractCleanSizeToken(rawSize) || rawSize || '-';
      const rawKat = String(item.kategori || item.category || '').trim();
      const validKat = rawKat && !['IN', 'OUT', 'SO', '-', 'PHYSICAL STOCK'].includes(rawKat.toUpperCase()) ? rawKat : '';
      map.set(rawSku, {
        sku: rawSku,
        nama_produk: cleanedName || rawName,
        size: cleanedSize,
        kategori: validKat,
      });
    }
    return map;
  }, [productCatalog]);

  // Compute all real-time WMS rack slots
  const allRackSlots = useMemo(() => {
    return computeAllRackSlots(config, stockRows, [], catalogMap);
  }, [stockRows, config, catalogMap]);

  // Build O(1) dictionary for 3D iframe sync
  const rackSlotsMap = useMemo(() => {
    const dict: Record<
      string,
      {
        lokasi: string;
        area: string;
        currentQty: number;
        maxCapacity: number;
        fillPercent: number;
        skuCount: number;
        status: string;
      }
    > = {};
    for (let i = 0; i < allRackSlots.length; i++) {
      const s = allRackSlots[i];
      dict[s.lokasi.toUpperCase()] = {
        lokasi: s.lokasi,
        area: s.area,
        currentQty: s.currentQty,
        maxCapacity: s.maxCapacity,
        fillPercent: s.fillPercent,
        skuCount: s.skuCount,
        status: s.status,
      };
    }
    return dict;
  }, [allRackSlots]);

  // Overall capacity KPI summary
  const summaryStats = useMemo(() => {
    let totalCurrent = 0;
    let totalMax = 0;
    let safeCount = 0;
    let warnCount = 0;
    let fullOverloadCount = 0;
    let emptyCount = 0;

    for (let i = 0; i < allRackSlots.length; i++) {
      const s = allRackSlots[i];
      totalCurrent += s.currentQty;
      totalMax += s.maxCapacity;
      if (s.status === 'OVERLOAD' || s.status === 'FULL') fullOverloadCount++;
      else if (s.status === 'WARNING') warnCount++;
      else if (s.status === 'SAFE') safeCount++;
      else emptyCount++;
    }
    const overallPct = totalMax > 0 ? Math.round((totalCurrent / totalMax) * 100) : 0;
    return {
      totalRacks: allRackSlots.length,
      totalCurrent,
      totalMax,
      overallPct,
      safeCount,
      warnCount,
      fullOverloadCount,
      emptyCount,
    };
  }, [allRackSlots]);

  const syncCapacityToIframe = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      {
        type: 'WMS_SYNC_CAPACITY',
        payload: rackSlotsMap,
      },
      '*'
    );
  }, [rackSlotsMap]);

  // Sync whenever rackSlotsMap updates
  useEffect(() => {
    syncCapacityToIframe();
  }, [syncCapacityToIframe]);

  // Listen to messages from the 3D iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'WMS_3D_READY') {
        syncCapacityToIframe();
        // Also check if there is a saved layout in Supabase wms_system_docs
        getSystemDocs()
          .then((docs) => {
            const found = Array.isArray(docs) ? docs.find((d) => d.section_id === WAREHOUSE_3D_DOC_KEY) : null;
            let remoteLayout: any = null;
            if (found && found.content) {
              try {
                remoteLayout = typeof found.content === 'string' ? JSON.parse(found.content) : found.content;
              } catch {}
            }
            let hasValidLocal = false;
            try {
              const stored = localStorage.getItem(LOCAL_STORAGE_3D_KEY);
              if (stored) {
                const parsedLocal = JSON.parse(stored);
                if (parsedLocal && Array.isArray(parsedLocal.objs) && parsedLocal.objs.length >= 10) {
                  hasValidLocal = true;
                }
              }
            } catch (e) {}
            if (remoteLayout && !hasValidLocal) {
              iframeRef.current?.contentWindow?.postMessage(
                { type: 'WMS_LOAD_CLOUD_STATE', payload: remoteLayout },
                '*'
              );
            }
          })
          .catch(() => {});
      } else if (data.type === 'WMS_3D_STATE_CHANGED') {
        latest3DStateRef.current = data.payload;
      } else if (data.type === 'WMS_PANEL_VISIBILITY_CHANGED') {
        setIsSidePanelHidden(!Boolean(data.payload));
      } else if (data.type === 'WMS_3D_HEATMAP_CHANGED') {
        setHeatmapActive(Boolean(data.payload));
      } else if (data.type === 'WMS_3D_OPEN_LOC_MODAL') {
        if (onOpenPrintModal && data.payload) {
          onOpenPrintModal(String(data.payload));
        }
      } else if (data.type === 'WMS_3D_SELECT_OBJ') {
        const p = data.payload;
        if (!p) {
          setSelectedRackInfo(null);
          return;
        }
        const codes: string[] = Array.isArray(p.codes) ? p.codes : [];
        const matched = codes
          .map((c) => allRackSlots.find((s) => s.lokasi.toUpperCase() === c.toUpperCase()))
          .filter((x): x is ComputedRackSlot => Boolean(x));
        setSelectedRackInfo({
          objId: p.objId,
          name: p.name,
          type: p.type,
          floor: p.floor,
          wmsCode: p.wmsCode,
          matchedSlots: matched,
          totalCurrentQty: p.curQty || 0,
          totalMaxCapacity: p.maxCap || 0,
          fillPercent: p.pct || 0,
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [syncCapacityToIframe, allRackSlots, onOpenPrintModal]);

  const handleToggleHeatmap = useCallback(() => {
    setHeatmapActive((prev) => {
      const next = !prev;
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'WMS_SET_HEATMAP', payload: next },
        '*'
      );
      return next;
    });
  }, []);

  const handleToggleTags = useCallback(() => {
    setShowTags((prev) => {
      const next = !prev;
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'WMS_SET_SHOW_TAGS', payload: next },
        '*'
      );
      return next;
    });
  }, []);

  const handleEnterPresentation = useCallback(() => {
    setIsPresentation(true);
    setIsAutoRotate(true);
    setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'WMS_SET_PRESENTATION_MODE', payload: true },
        '*'
      );
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'WMS_SET_AUTO_ROTATE', payload: true },
        '*'
      );
    }, 60);
  }, []);

  const handleExitPresentation = useCallback(() => {
    setIsPresentation(false);
    setIsAutoRotate(false);
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'WMS_SET_PRESENTATION_MODE', payload: false },
      '*'
    );
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'WMS_SET_AUTO_ROTATE', payload: false },
      '*'
    );
  }, []);

  const handleToggleAutoRotate = useCallback(() => {
    setIsAutoRotate((prev) => {
      const next = !prev;
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'WMS_SET_AUTO_ROTATE', payload: next },
        '*'
      );
      return next;
    });
  }, []);

  const handleSelectFloor = useCallback((floor: 'ALL' | number) => {
    setActiveFloor(floor);
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'WMS_SET_ACTIVE_FLOOR', payload: floor },
      '*'
    );
  }, []);

  const handleSelectCameraPreset = useCallback((camIndex: number) => {
    setActiveCameraPreset(camIndex);
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'WMS_SET_CAMERA_PRESET', payload: camIndex },
      '*'
    );
  }, []);

  // Keyboard navigation for presentation mode
  useEffect(() => {
    if (!isPresentation) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName || '')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        handleExitPresentation();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handleToggleAutoRotate();
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        handleToggleHeatmap();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        handleToggleTags();
      } else if (e.key === '0') {
        e.preventDefault();
        handleSelectFloor('ALL');
      } else if (e.key === '1') {
        e.preventDefault();
        handleSelectFloor(0);
      } else if (e.key === '2') {
        e.preventDefault();
        handleSelectFloor(1);
      } else if (e.key === '3') {
        e.preventDefault();
        handleSelectFloor(2);
      } else if (e.key === '4') {
        e.preventDefault();
        handleSelectFloor(3);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPresentation, handleExitPresentation, handleToggleAutoRotate, handleToggleHeatmap, handleToggleTags, handleSelectFloor]);

  const handleToggleSidePanel = useCallback((forceVal?: boolean) => {
    if (typeof forceVal === 'boolean') {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'WMS_SET_PANEL_VISIBILITY', payload: forceVal },
        '*'
      );
    } else {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'WMS_TOGGLE_PANEL_VISIBILITY' },
        '*'
      );
    }
  }, []);

  const handleAutoMapRacks = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'WMS_AUTO_MAP_RACKS' }, '*');
    if (onNotify) {
      onNotify(
        'Seluruh rak 3D berhasil dipetakan ke kode rak Gudang WMS (A, B, C, D, Koli R/V/Z, & Studio)!',
        'success'
      );
    }
  };

  const handleResetDefaultLayout = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'WMS_RESET_SEED' }, '*');
    if (onNotify) {
      onNotify('Layout 3D dikembalikan ke tata letak gedung 4 lantai awal.', 'info');
    }
  };

  const handleSaveCloud = async () => {
    setIsSavingCloud(true);
    try {
      const raw =
        latest3DStateRef.current ||
        localStorage.getItem(LOCAL_STORAGE_3D_KEY) ||
        DEFAULT_WAREHOUSE_3D_SEED;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      await saveSystemDoc({
        section_id: WAREHOUSE_3D_DOC_KEY,
        content: JSON.stringify({
          ...parsed,
          updatedAt: new Date().toISOString(),
          updatedBy: session?.username || 'admin',
        }),
        updated_at: new Date().toISOString(),
        updated_by: session?.username || 'admin',
      });
      if (onNotify) {
        onNotify('Tata letak Gudang 3D berhasil disimpan ke database server!', 'success');
      }
    } catch (err: any) {
      if (onNotify) {
        onNotify(err?.message || 'Gagal menyimpan tata letak 3D ke server', 'error');
      }
    } finally {
      setIsSavingCloud(false);
    }
  };

  const srcDocHtml = useMemo(() => buildWarehouse3DHtml(DEFAULT_WAREHOUSE_3D_SEED), []);

  return (
    <div
      ref={containerRef}
      className={
        isPresentation
          ? 'fixed inset-0 z-[120] bg-slate-950 flex flex-col overflow-hidden select-none'
          : isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-950 flex flex-col p-2 sm:p-3 space-y-2.5'
          : 'w-full space-y-3'
      }
    >
      {/* ========================================================
          A. FULLSCREEN PRESENTATION MODE HUD OVERLAYS
          ======================================================== */}
      {isPresentation ? (
        <>
          {/* Top Floating Executive HUD */}
          <div className="absolute top-3 left-3 right-3 z-30 pointer-events-none flex flex-wrap items-center justify-between gap-2.5">
            {/* Left Brand Badge */}
            <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl px-3.5 py-2 shadow-2xl flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
                <Tv className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xs sm:text-sm text-white tracking-wide">
                    Presentasi 3D Gudang
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    LIVE SYNC
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 hidden sm:block">
                  Kapasitas Real-Time &amp; Tur 360° ({summaryStats.totalRacks.toLocaleString('id-ID')} Rak)
                </p>
              </div>
            </div>

            {/* Center Floor Switcher Tabs */}
            <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-1 shadow-2xl flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
              <button
                type="button"
                onClick={() => handleSelectFloor('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeFloor === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
                title="Tampilkan seluruh gedung 4 lantai (Tekan 0)"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Semua (4 Lt)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectFloor(0)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeFloor === 0
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
                title="Lantai 1: Studio & Jahit (Tekan 1)"
              >
                Lt.1 Studio
              </button>
              <button
                type="button"
                onClick={() => handleSelectFloor(1)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeFloor === 1
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
                title="Lantai 2: Rak C & D (Tekan 2)"
              >
                Lt.2 Rak C &amp; D
              </button>
              <button
                type="button"
                onClick={() => handleSelectFloor(2)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeFloor === 2
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
                title="Lantai 3: Section A (Dress) & B (Bottom) (Tekan 3)"
              >
                Lt.3 Rak A &amp; B
              </button>
              <button
                type="button"
                onClick={() => handleSelectFloor(3)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeFloor === 3
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
                title="Lantai 4: Area Kolian R/V/Z (Tekan 4)"
              >
                Lt.4 Kolian
              </button>
            </div>

            {/* Right Controls: Camera Presets, 360 Tour, Heatmap & Exit */}
            <div className="pointer-events-auto flex items-center gap-1.5">
              {/* Camera Presets */}
              <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-1 shadow-2xl hidden md:flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSelectCameraPreset(0)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeCameraPreset === 0
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Sudut Pandang Isometrik 3D"
                >
                  3D Iso
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectCameraPreset(1)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeCameraPreset === 1
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Tampak Denah Atas (2D Top View)"
                >
                  Tampak Atas
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectCameraPreset(2)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeCameraPreset === 2
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Sudut Pandang Fokus Depan"
                >
                  Fokus
                </button>
              </div>

              {/* 360° Auto-Rotate Tour Button */}
              <button
                type="button"
                onClick={handleToggleAutoRotate}
                className={`px-3 py-2 rounded-2xl text-xs font-bold backdrop-blur-md border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xl ${
                  isAutoRotate
                    ? 'bg-amber-500/25 text-amber-300 border-amber-500/60 ring-2 ring-amber-500/30'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700/80'
                }`}
                title="Mulai/Hentikan putaran kamera 360° otomatis mengitari gedung (Tekan Spasi)"
              >
                {isAutoRotate ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    <span className="hidden sm:inline">Pause 360°</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-slate-300" />
                    <span className="hidden sm:inline">Tur 360°</span>
                  </>
                )}
              </button>

              {/* Heatmap Toggle */}
              <button
                type="button"
                onClick={handleToggleHeatmap}
                className={`px-3 py-2 rounded-2xl text-xs font-bold backdrop-blur-md border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xl ${
                  heatmapActive
                    ? 'bg-indigo-600 text-white border-indigo-500 ring-2 ring-indigo-500/30'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700/80'
                }`}
                title="Tampilkan heatmap tingkat kepenuhan rak (Tekan H)"
              >
                <Flame className={`w-3.5 h-3.5 ${heatmapActive ? 'text-amber-300' : 'text-slate-400'}`} />
                <span className="hidden sm:inline">Heatmap</span>
              </button>

              {/* Toggle Label / Marking Rak */}
              <button
                type="button"
                onClick={handleToggleTags}
                className={`px-3 py-2 rounded-2xl text-xs font-bold backdrop-blur-md border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xl ${
                  showTags
                    ? 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700/80'
                    : 'bg-slate-900/60 text-slate-500 border-slate-800'
                }`}
                title="Sembunyikan/Tampilkan tulisan penanda & label kode rak di 3D (Tekan T)"
              >
                {showTags ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">Marking: ON</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden sm:inline">Marking: OFF</span>
                  </>
                )}
              </button>

              {/* Exit Presentation */}
              <button
                type="button"
                onClick={handleExitPresentation}
                className="px-3.5 py-2 rounded-2xl text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/50 backdrop-blur-md flex items-center gap-1.5 transition-all cursor-pointer shadow-2xl"
                title="Keluar dari mode presentasi (Tekan ESC)"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Keluar [ESC]</span>
              </button>
            </div>
          </div>

          {/* Floating Selected Rack Live Inspector (if user clicks a rack during presentation) */}
          {selectedRackInfo && selectedRackInfo.wmsCode && (
            <div className="absolute right-4 bottom-18 sm:bottom-16 z-30 pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-indigo-500/40 rounded-2xl p-3.5 shadow-2xl max-w-sm w-full text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-mono font-extrabold text-xs shrink-0">
                    📍 {selectedRackInfo.wmsCode}
                  </span>
                  <span className="font-bold text-white truncate">
                    {selectedRackInfo.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRackInfo(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Tutup inspektor"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Tingkat Kepenuhan:</span>
                <span className="font-mono font-bold text-indigo-400">
                  {selectedRackInfo.totalCurrentQty} / {selectedRackInfo.totalMaxCapacity} pcs ({selectedRackInfo.fillPercent}%)
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700/60">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    selectedRackInfo.fillPercent >= 100
                      ? 'bg-rose-500'
                      : selectedRackInfo.fillPercent >= 80
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, selectedRackInfo.fillPercent)}%` }}
                />
              </div>

              {selectedRackInfo.matchedSlots[0] && onOpenPrintModal && (
                <button
                  type="button"
                  onClick={() => onOpenPrintModal(selectedRackInfo.matchedSlots[0].lokasi)}
                  className="w-full mt-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Detail &amp; Cetak Rak ({selectedRackInfo.matchedSlots[0].lokasi})</span>
                </button>
              )}
            </div>
          )}

          {/* Bottom Floating Executive KPI Strip & Shortcuts */}
          <div className="absolute bottom-3 left-3 right-3 z-30 pointer-events-none flex flex-col sm:flex-row items-center justify-between gap-2.5">
            {/* KPI Live Capacity Meter */}
            <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl px-4 py-2.5 shadow-2xl flex flex-wrap items-center gap-3.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400">Okupansi Gudang:</span>
                <span className="font-mono font-extrabold text-indigo-400 text-sm">
                  {summaryStats.totalCurrent.toLocaleString('id-ID')} / {summaryStats.totalMax.toLocaleString('id-ID')} pcs ({summaryStats.overallPct}%)
                </span>
              </div>
              <div className="w-24 sm:w-36 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    summaryStats.overallPct >= 90
                      ? 'bg-rose-500'
                      : summaryStats.overallPct >= 75
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, summaryStats.overallPct)}%` }}
                />
              </div>
              <span className="text-slate-700 hidden sm:inline">|</span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  Aman: <b className="font-mono">{summaryStats.safeCount}</b>
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  Hampir Penuh: <b className="font-mono">{summaryStats.warnCount}</b>
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                  Overload: <b className="font-mono">{summaryStats.fullOverloadCount}</b>
                </span>
              </div>
            </div>

            {/* Keyboard shortcut tips */}
            <div className="pointer-events-auto hidden md:flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl px-3.5 py-2 text-[11px] text-slate-400 font-mono shadow-xl">
              <span>[Spasi] Tur 360°</span>
              <span className="text-slate-700">·</span>
              <span>[H] Heatmap</span>
              <span className="text-slate-700">·</span>
              <span>[T] Marking</span>
              <span className="text-slate-700">·</span>
              <span>[0-4] Pilih Lantai</span>
              <span className="text-slate-700">·</span>
              <span>[ESC] Keluar</span>
            </div>
          </div>
        </>
      ) : (
        /* ========================================================
            B. STANDARD MODE: TOP CONTROL & LIVE CAPACITY BAR
            ======================================================== */
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-xs space-y-2.5">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Title & Live Status */}
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    Visualisasi 3D Layout &amp; Kapasitas Gudang (4 Lantai)
                  </h2>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                    LIVE SYNC WMS ({summaryStats.totalRacks.toLocaleString('id-ID')} Rak)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Klik rak pada gedung 3D untuk menginspeksi kapasitas real-time, mengubah kode rak WMS, atau mencetak daftar isi rak.
                </p>
              </div>
            </div>

            {/* Toolbar Actions (Max 1 primary solid button + neutral secondary outline buttons per Rule 10) */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* PRIMARY SOLID BUTTON: Fullscreen 3D Presentation */}
              <button
                type="button"
                onClick={handleEnterPresentation}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-indigo-500/20"
                title="Buka tampilan 3D dalam mode presentasi layar penuh interaktif (dengan tur kamera 360° dan switcher lantai)"
              >
                <Presentation className="w-3.5 h-3.5" />
                <span>Mode Presentasi 3D</span>
              </button>

              {/* SECONDARY OUTLINE: Heatmap */}
              <button
                type="button"
                onClick={handleToggleHeatmap}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                  heatmapActive
                    ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-700'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
                title="Ubah warna rak 3D berdasarkan tingkat kepenuhan stok nyata (Hijau / Kuning / Merah)"
              >
                {heatmapActive ? (
                  <>
                    <Flame className="w-3.5 h-3.5 text-amber-500" />
                    <span>Heatmap: ON</span>
                  </>
                ) : (
                  <>
                    <Palette className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Heatmap 3D</span>
                  </>
                )}
              </button>

              {/* SECONDARY OUTLINE: Toggle Marking / Penanda Rak */}
              <button
                type="button"
                onClick={handleToggleTags}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs border ${
                  showTags
                    ? 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    : 'bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800'
                }`}
                title="Sembunyikan atau tampilkan tulisan penanda & label kode rak di gedung 3D (Tekan T)"
              >
                {showTags ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Marking: ON</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                    <span>Marking: OFF</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleAutoMapRacks}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Petakan otomatis rak 3D ke kode rak A, B, C, D, Koli R/V/Z, & Studio"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Auto-Map Rak</span>
              </button>

              <button
                type="button"
                disabled={isSavingCloud}
                onClick={handleSaveCloud}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                title="Simpan perubahan desain 3D ke database server"
              >
                <CloudUpload className={`w-3.5 h-3.5 text-emerald-500 ${isSavingCloud ? 'animate-bounce' : ''}`} />
                <span>{isSavingCloud ? 'Menyimpan...' : 'Simpan Cloud'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefaultLayout}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Kembalikan tata letak 3D ke desain awal"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Reset Default</span>
              </button>

              {onRefreshStock && (
                <button
                  type="button"
                  disabled={isRefreshingStock}
                  onClick={onRefreshStock}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                  title="Segarkan stok fisik dari database"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-500 ${isRefreshingStock ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh Stok</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleToggleSidePanel()}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                  isSidePanelHidden
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
                title="Sembunyikan atau buka panel editor perancang gudang (Tekan H)"
              >
                {isSidePanelHidden ? (
                  <>
                    <PanelLeft className="w-3.5 h-3.5 text-amber-500" />
                    <span>Buka Panel Desain</span>
                  </>
                ) : (
                  <>
                    <PanelLeftClose className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden sm:inline">Sembunyikan Panel</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title={isFullscreen ? 'Keluar Layar Penuh' : 'Tampilan Layar Penuh'}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Tutup Fullscreen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden sm:inline">Layar Penuh</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Live Capacity Legend & Mini Metrics Strip */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Okupansi Gudang:</span>
                <span className="font-mono font-extrabold text-indigo-600 dark:text-indigo-400">
                  {summaryStats.totalCurrent.toLocaleString('id-ID')} / {summaryStats.totalMax.toLocaleString('id-ID')} pcs ({summaryStats.overallPct}%)
                </span>
              </div>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Aman (&lt;80%): <b className="font-mono">{summaryStats.safeCount}</b>
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  Hampir Penuh (80-99%): <b className="font-mono">{summaryStats.warnCount}</b>
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                  Penuh/Overload (≥100%): <b className="font-mono">{summaryStats.fullOverloadCount}</b>
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-slate-500 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
                  Kosong: <b className="font-mono">{summaryStats.emptyCount}</b>
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              Lt.1 Studio &amp; Jahit · Lt.2 Rak C &amp; D · Lt.3 Section A (Dress) &amp; B (Bottom) · Lt.4 Area Kolian (R/V/Z)
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          C. SELECTED 3D RACK LIVE INSPECTOR BAR (IF A RACK IS CLICKED IN STANDARD MODE)
          ======================================================== */}
      {!isPresentation && selectedRackInfo && selectedRackInfo.wmsCode && (
        <div className="bg-white dark:bg-[#131d31] border border-indigo-200 dark:border-indigo-900/70 rounded-2xl p-3 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-mono font-extrabold text-xs shrink-0">
              📍 {selectedRackInfo.wmsCode}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {selectedRackInfo.name} ({selectedRackInfo.type} · Lantai {selectedRackInfo.floor})
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    selectedRackInfo.fillPercent >= 100
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                      : selectedRackInfo.fillPercent >= 80
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                      : selectedRackInfo.totalCurrentQty > 0
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-500/15 text-slate-500 border border-slate-500/30'
                  }`}
                >
                  Terisi {selectedRackInfo.totalCurrentQty} / {selectedRackInfo.totalMaxCapacity} pcs ({selectedRackInfo.fillPercent}%)
                </span>
              </div>
              {selectedRackInfo.matchedSlots.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {selectedRackInfo.matchedSlots.slice(0, 10).map((slot) => (
                    <button
                      key={slot.lokasi}
                      type="button"
                      onClick={() => onOpenPrintModal && onOpenPrintModal(slot.lokasi)}
                      className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                      title={`Klik untuk lihat/cetak isi rak ${slot.lokasi}`}
                    >
                      <span>{slot.lokasi}:</span>
                      <span
                        className={
                          slot.fillPercent >= 100
                            ? 'text-rose-500'
                            : slot.fillPercent >= 80
                            ? 'text-amber-500'
                            : slot.currentQty > 0
                            ? 'text-emerald-500'
                            : 'text-slate-400'
                        }
                      >
                        {slot.currentQty}/{slot.maxCapacity}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedRackInfo.matchedSlots[0] && onOpenPrintModal && (
              <button
                type="button"
                onClick={() => onOpenPrintModal(selectedRackInfo.matchedSlots[0].lokasi)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Detail &amp; Cetak Rak ({selectedRackInfo.matchedSlots[0].lokasi})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedRackInfo(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              title="Tutup panel inspeksi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          D. INTERACTIVE 3D WAREHOUSE CANVAS (IFRAME)
          ======================================================== */}
      <div
        className={`w-full overflow-hidden border shadow-sm bg-[#0f172a] relative ${
          isPresentation
            ? 'flex-1 min-h-0 border-0 rounded-none'
            : isFullscreen
            ? 'flex-1 min-h-0 rounded-2xl border-slate-200 dark:border-slate-800'
            : 'h-[calc(100vh-220px)] min-h-[640px] rounded-2xl border-slate-200 dark:border-slate-800'
        }`}
      >
        <iframe
          ref={iframeRef}
          title="Perancang & Visualisasi Kapasitas Gudang 3D"
          srcDoc={srcDocHtml}
          className="w-full h-full border-0 block"
          sandbox="allow-scripts allow-same-origin allow-downloads allow-popups"
        />
      </div>
    </div>
  );
};

export default Warehouse3DVisualTab;
