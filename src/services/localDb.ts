import Dexie, { Table } from 'dexie';
import { 
  ProductItem, 
  StockRealtimeItem, 
  LogProdukItem, 
  PeminjamanRecord, 
  PickingListItem,
  StockOpnameQueueItem
} from '../types';

// Define metadata for sync engine
export interface SyncMeta {
  tableName: string;
  lastSyncTime: string; // ISO String
}

// Define structure for offline mutations waiting to be uploaded
export interface OfflineLog {
  id?: number; // Auto-increment local ID
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  tableName: string;
  payload: any;
  timestamp: string; // Waktu offline action terjadi
  status: 'pending' | 'syncing' | 'failed';
  errorMsg?: string;
}

export class WmsDatabase extends Dexie {
  products!: Table<ProductItem, string>; // k (SKU) as primary key
  stokRealtime!: Table<StockRealtimeItem, string>; // [sku+lokasi] as primary key (compound)
  logProduk!: Table<LogProdukItem, string>; // id (UUID) as primary key
  peminjaman!: Table<PeminjamanRecord, string>; // id (UUID) as primary key
  pickingList!: Table<PickingListItem, string>; // id (UUID) as primary key
  soQueue!: Table<StockOpnameQueueItem, string>; // id (UUID) as primary key
  
  // Infrastructure tables
  syncMeta!: Table<SyncMeta, string>; // tableName as primary key
  offlineLogs!: Table<OfflineLog, number>; // auto-increment local id

  constructor() {
    super('WmsLocalDatabase');
    
    // Define schema
    this.version(1).stores({
      products: 'k, n, p, category, lokasi', // k is primary key (SKU)
      stokRealtime: '[sku+lokasi], sku, lokasi, area', // compound primary key [sku+lokasi]
      logProduk: 'id, sku, lokasi, invoice, type, created_at', 
      peminjaman: 'id, no_sps, tanggal_pinjam, status',
      pickingList: 'id, no_sj, sku, status',
      soQueue: 'id, sesi_id, sku, status',
      
      syncMeta: 'tableName', // Only primary key needed
      offlineLogs: '++id, status, tableName, timestamp' // ++ means auto-increment
    });
  }
}

export const localDb = new WmsDatabase();
