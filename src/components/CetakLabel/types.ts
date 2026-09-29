export interface LocationLabelItem {
  id: string;
  locCode: string; // e.g. "A-001"
  qrPayload: string; // e.g. "#LOK A001" or "#LOK A-001"
  zoneDesc: string; // e.g. "WAREHOUSE - DRESS"
  tagBadge?: string; // e.g. "ZONA A"
  copies: number;
  selected?: boolean;
  qrDataUrl?: string;
}

export interface CustomQrLabelItem {
  id: string;
  title: string; // e.g. "#OUT" or "PALLET-01"
  subtitle?: string; // e.g. "SCAN KELUAR / DISPATCH"
  qrPayload: string; // e.g. "#OUT"
  badge?: string; // e.g. "ACTION WMS"
  copies: number;
  selected?: boolean;
  qrDataUrl?: string;
}

export type LocationPrintMedia =
  | 'thermal_100x50'
  | 'thermal_80x50'
  | 'thermal_70x40'
  | 'thermal_50x30'
  | 'thermal_50x20'
  | 'a6_1'
  | 'a6_2'
  | 'a6_4'
  | 'a6_6';

export type LocationCodeFontSize = 'normal' | 'large' | 'xlarge' | 'jumbo';
export type LocationQrSize = 'small' | 'normal' | 'large' | 'xlarge' | 'jumbo';
export type LocationLayoutOrientation = 'stacked' | 'side-by-side' | 'header-card';

export interface LocationLabelSettings {
  media: LocationPrintMedia;
  codeFontSize: LocationCodeFontSize;
  codeFontWeight: '700' | '800' | '900';
  qrSize: LocationQrSize;
  layout: LocationLayoutOrientation;
  showZoneDesc: boolean;
  showTagBadge: boolean;
  showQrPayloadText: boolean;
  showCutLines: boolean;
  borderStyle: 'solid' | 'dashed' | 'bold' | 'none';
  headerColor: 'dark' | 'light' | 'outline' | 'purple' | 'emerald';
  isRotated180: boolean;
}

export const DEFAULT_LOCATION_SETTINGS: LocationLabelSettings = {
  media: 'a6_4',
  codeFontSize: 'xlarge',
  codeFontWeight: '900',
  qrSize: 'large',
  layout: 'stacked',
  showZoneDesc: true,
  showTagBadge: true,
  showQrPayloadText: true,
  showCutLines: true,
  borderStyle: 'bold',
  headerColor: 'dark',
  isRotated180: false,
};

export const WMS_QUICK_PREFIXES = [
  {
    code: '#IN',
    title: 'SCAN MASUK (#IN)',
    subtitle: 'Mode Penerimaan Barang & Restock',
    badge: 'ACTION WMS',
    color: 'emerald',
  },
  {
    code: '#OUT',
    title: 'SCAN KELUAR (#OUT)',
    subtitle: 'Mode Pengiriman & Dispatch Pesanan',
    badge: 'ACTION WMS',
    color: 'red',
  },
  {
    code: '#SO',
    title: 'STOCK OPNAME (#SO)',
    subtitle: 'Mode Audit Fisik & Cek Selisih Stok',
    badge: 'ACTION WMS',
    color: 'purple',
  },
  {
    code: '#QC',
    title: 'QUALITY CONTROL (#QC)',
    subtitle: 'Mode Pengecekan Defect & Reject',
    badge: 'ACTION WMS',
    color: 'amber',
  },
  {
    code: '#MUTASI',
    title: 'PINDAH RAK (#MUTASI)',
    subtitle: 'Mode Relokasi Antar Rak & Bin',
    badge: 'ACTION WMS',
    color: 'indigo',
  },
  {
    code: '#RETUR',
    title: 'RETUR BARANG (#RETUR)',
    subtitle: 'Mode Penerimaan Paket Retur Pelanggan',
    badge: 'ACTION WMS',
    color: 'orange',
  },
  {
    code: '#RESET',
    title: 'RESET SCANNER (#RESET)',
    subtitle: 'Bersihkan Sesi & Kembali ke Siaga',
    badge: 'SYSTEM WMS',
    color: 'slate',
  },
  {
    code: '#CLEAR',
    title: 'BERSIHKAN LIST (#CLEAR)',
    subtitle: 'Hapus Antrean Scan Terakhir',
    badge: 'SYSTEM WMS',
    color: 'slate',
  },
];
