import { ManualShipmentOrder, ManualShipmentHistoryLog, ManualShipmentItem } from '../types';
import { supabaseFetch } from './supabase';
import { hasValidArData } from '../utils/alterationUtils';
import { globalRealtimeStore } from './store';

export const DEFAULT_MANUAL_SHIPMENT_GAS_URL = '';

/**
 * Mapping kode singkat store ke nama lengkap resmi
 */
export const STORE_CODE_TO_FULL_NAME: Record<string, string> = {
  GAIA: 'Gaia Pontianak',
  BTS: 'By The Sea PIK',
  CPJ: 'Central Park Jakarta',
  CWS: 'Ciputra World Surabaya',
  DPM: 'Deli Park Medan',
  GST: 'Gading Serpong Tangerang',
  LMP: 'Lippo Mall Puri',
  LVL: 'La Vela Tangerang',
  LWS: 'Living World Tangerang',
  MKG: 'Mall Kelapa Gading',
  NSJ: 'Neo Soho Jakarta',
  PHB: 'Paskal Hyper Square Bandung',
  PIM: 'Pondok Indah Mall',
  PMS: 'Pakuwon Mall Surabaya',
  SPM: 'Sun Plaza Medan',
  TP: 'Tunjungan Plaza Surabaya',
  KYTE: 'Kyte',
};

/**
 * Helper untuk mendapatkan nama lengkap store (tidak disingkat)
 */
export function getFullStoreName(storeNameOrCode?: string): string {
  if (!storeNameOrCode) return '';
  const trimmed = storeNameOrCode.trim();
  const upper = trimmed.toUpperCase().replace(/\s+/g, '').replace(/[-_]/g, '');

  // 1. Cek di direktori kontak custom pengguna terlebih dahulu (agar store baru / bazaar seperti SMS tidak tertimpa)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem('wms_store_contacts_directory');
      if (raw) {
        const savedContacts: Record<string, OutletContactInfo> = JSON.parse(raw);
        if (savedContacts[trimmed]) {
          return savedContacts[trimmed].nama || trimmed;
        }
        const trimmedLower = trimmed.toLowerCase();
        const exactMatch = Object.values(savedContacts).find(
          (c) =>
            c &&
            ((c.nama && c.nama.trim().toLowerCase() === trimmedLower) ||
              (c.kode && c.kode.trim().toUpperCase() === upper))
        );
        if (exactMatch && exactMatch.nama) {
          return exactMatch.nama;
        }
      }
    } catch {}
  }

  if (STORE_CODE_TO_FULL_NAME[upper]) {
    return STORE_CODE_TO_FULL_NAME[upper];
  }

  // Jika menggunakan format username atau prefix "CHOCO" (misal CHOCOGST, CHOCOCPJ, dll)
  if (upper.startsWith('CHOCO')) {
    const code = upper.substring(5);
    if (STORE_CODE_TO_FULL_NAME[code]) {
      return STORE_CODE_TO_FULL_NAME[code];
    }
  }

  // Cek alias eksak nama toko / outlet (tanpa .includes bebas agar tidak menimpa nama store baru seperti "Bazaar Summarecon Mall Serpong")
  const lower = trimmed.toLowerCase().replace(/\s+/g, '').replace(/[-_]/g, '');
  if (
    lower === 'gadingserpong' ||
    lower === 'gadingserpongtangerang' ||
    lower === 'gst' ||
    lower === 'chocogst' ||
    lower === 'chocogs'
  ) {
    return 'Gading Serpong Tangerang';
  }
  if (lower === 'centralpark' || lower === 'centralparkjakarta' || lower === 'cpj' || lower === 'chococpj') {
    return 'Central Park Jakarta';
  }
  if (lower === 'livingworld' || lower === 'livingworldtangerang' || lower === 'lws' || lower === 'chocolws') {
    return 'Living World Tangerang';
  }
  if (lower === 'kelapagading' || lower === 'mallkelapagading' || lower === 'mkg' || lower === 'chocomkg') {
    return 'Mall Kelapa Gading';
  }
  if (lower === 'bythesea' || lower === 'bytheseapik' || lower === 'bts' || lower === 'chocobts') {
    return 'By The Sea PIK';
  }
  if (lower === 'gaiapontianak' || lower === 'gaia' || lower === 'chocogaia') {
    return 'Gaia Pontianak';
  }
  if (lower === 'ciputraworld' || lower === 'ciputraworldsurabaya' || lower === 'cws' || lower === 'chococws') {
    return 'Ciputra World Surabaya';
  }
  if (lower === 'delipark' || lower === 'deliparkmedan' || lower === 'dpm' || lower === 'chocodpm') {
    return 'Deli Park Medan';
  }
  if (lower === 'lippomallpuri' || lower === 'lippopuri' || lower === 'lmp' || lower === 'chocolmp') {
    return 'Lippo Mall Puri';
  }
  if (lower === 'lavela' || lower === 'lavelatangerang' || lower === 'lvl' || lower === 'chocolvl') {
    return 'La Vela Tangerang';
  }
  if (lower === 'neosoho' || lower === 'neosohojakarta' || lower === 'nsj' || lower === 'choconsj') {
    return 'Neo Soho Jakarta';
  }
  if (lower === 'paskal' || lower === 'paskalhypersquare' || lower === 'paskalhypersquarebandung' || lower === 'phb' || lower === 'chocophb') {
    return 'Paskal Hyper Square Bandung';
  }
  if (lower === 'pondokindah' || lower === 'pondokindahmall' || lower === 'pim' || lower === 'chocopim') {
    return 'Pondok Indah Mall';
  }
  if (lower === 'pakuwon' || lower === 'pakuwonmall' || lower === 'pakuwonmallsurabaya' || lower === 'pms' || lower === 'chocopms') {
    return 'Pakuwon Mall Surabaya';
  }
  if (lower === 'sunplaza' || lower === 'sunplazamedan' || lower === 'spm' || lower === 'chocospm') {
    return 'Sun Plaza Medan';
  }
  if (lower === 'tunjunganplaza' || lower === 'tunjunganplazasurabaya' || lower === 'tp' || lower === 'chocotp') {
    return 'Tunjungan Plaza Surabaya';
  }
  if (lower === 'kyte' || lower === 'chocokyte') {
    return 'Kyte';
  }

  // Cocokkan terhadap DEFAULT_OUTLETS
  for (const o of DEFAULT_OUTLETS) {
    if (o.nama.toLowerCase() === trimmed.toLowerCase() || o.kode.toLowerCase() === trimmed.toLowerCase()) {
      return o.nama;
    }
  }

  return trimmed;
}

/**
 * Helper untuk membandingkan apakah dua nama store/outlet merujuk ke toko yang sama
 */
export function isSameStore(storeA?: string, storeB?: string): boolean {
  if (!storeA || !storeB) return false;
  const fullA = getFullStoreName(storeA).toLowerCase().trim();
  const fullB = getFullStoreName(storeB).toLowerCase().trim();
  if (!fullA || !fullB) return false;
  return fullA === fullB;
}

/**
 * Daftar resmi store / outlet lengkap yang disinkronkan langsung dengan Master Produk & DealPOS.
 * Nama ditulis lengkap (bukan singkatan) untuk modul operasional & loading dock.
 */
export const DEFAULT_OUTLETS: { nama: string; fulfillment: string; kode: string }[] = [
  { nama: 'Gaia Pontianak', fulfillment: 'Gaia Pontianak', kode: 'GAIA' },
  { nama: 'By The Sea PIK', fulfillment: 'By The Sea PIK', kode: 'BTS' },
  { nama: 'Central Park Jakarta', fulfillment: 'Central Park Jakarta', kode: 'CPJ' },
  { nama: 'Ciputra World Surabaya', fulfillment: 'Ciputra World Surabaya', kode: 'CWS' },
  { nama: 'Deli Park Medan', fulfillment: 'Deli Park Medan', kode: 'DPM' },
  { nama: 'Gading Serpong Tangerang', fulfillment: 'Gading Serpong Tangerang', kode: 'GST' },
  { nama: 'Lippo Mall Puri', fulfillment: 'Lippo Mall Puri', kode: 'LMP' },
  { nama: 'La Vela Tangerang', fulfillment: 'La Vela Tangerang', kode: 'LVL' },
  { nama: 'Living World Tangerang', fulfillment: 'Living World Tangerang', kode: 'LWS' },
  { nama: 'Mall Kelapa Gading', fulfillment: 'Mall Kelapa Gading', kode: 'MKG' },
  { nama: 'Neo Soho Jakarta', fulfillment: 'Neo Soho Jakarta', kode: 'NSJ' },
  { nama: 'Paskal Hyper Square Bandung', fulfillment: 'Paskal Hyper Square Bandung', kode: 'PHB' },
  { nama: 'Pondok Indah Mall', fulfillment: 'Pondok Indah Mall', kode: 'PIM' },
  { nama: 'Pakuwon Mall Surabaya', fulfillment: 'Pakuwon Mall Surabaya', kode: 'PMS' },
  { nama: 'Sun Plaza Medan', fulfillment: 'Sun Plaza Medan', kode: 'SPM' },
  { nama: 'Tunjungan Plaza Surabaya', fulfillment: 'Tunjungan Plaza Surabaya', kode: 'TP' },
  { nama: 'Kyte', fulfillment: 'Kyte', kode: 'KYTE' },
];

/**
 * Direktori Kontak WhatsApp Resmi Seluruh Toko / Outlet Chocochips
 */
export interface OutletContactInfo {
  nama: string;
  kode: string;
  no_wa: string;
  alamat_store?: string;
  email_store?: string;
  pic_default?: string;
}

export const DEFAULT_STORE_CONTACTS: Record<string, OutletContactInfo> = {
  'Central Park Jakarta': { nama: 'Central Park Jakarta', kode: 'CPJ', no_wa: '081288990011', alamat_store: 'Mall Central Park Lt. 1 No. 102, Jakarta Barat', email_store: 'cpj.store@chocochips.id' },
  'Gading Serpong Tangerang': { nama: 'Gading Serpong Tangerang', kode: 'GST', no_wa: '081288990022', alamat_store: 'Ruko Gading Serpong Blok AA3 No. 12, Tangerang', email_store: 'gst.store@chocochips.id' },
  'By The Sea PIK': { nama: 'By The Sea PIK', kode: 'BTS', no_wa: '081288990033', alamat_store: 'By The Sea Shopping District PIK Unit 18, Jakarta Utara', email_store: 'bts.store@chocochips.id' },
  'Lippo Mall Puri': { nama: 'Lippo Mall Puri', kode: 'LMP', no_wa: '081288990044', alamat_store: 'Lippo Mall Puri Lt. LG Unit 45, Jakarta Barat', email_store: 'lmp.store@chocochips.id' },
  'Mall Kelapa Gading': { nama: 'Mall Kelapa Gading', kode: 'MKG', no_wa: '081288990055', alamat_store: 'Mall Kelapa Gading 3 Lt. 2 No. 201, Jakarta Utara', email_store: 'mkg.store@chocochips.id' },
  'Neo Soho Jakarta': { nama: 'Neo Soho Jakarta', kode: 'NSJ', no_wa: '081288990066', alamat_store: 'Neo Soho Mall Lt. UG Unit 210, Jakarta Barat', email_store: 'nsj.store@chocochips.id' },
  'Pondok Indah Mall': { nama: 'Pondok Indah Mall', kode: 'PIM', no_wa: '081288990077', alamat_store: 'Pondok Indah Mall 2 Lt. 1 No. 115, Jakarta Selatan', email_store: 'pim.store@chocochips.id' },
  'La Vela Tangerang': { nama: 'La Vela Tangerang', kode: 'LVL', no_wa: '081288990088', alamat_store: 'Ruko La Vela No. 8 Gading Serpong, Tangerang', email_store: 'lvl.store@chocochips.id' },
  'Living World Tangerang': { nama: 'Living World Tangerang', kode: 'LWS', no_wa: '081288990099', alamat_store: 'Living World Alam Sutera Lt. 1 No. 108, Tangerang', email_store: 'lws.store@chocochips.id' },
  'Gaia Pontianak': { nama: 'Gaia Pontianak', kode: 'GAIA', no_wa: '081288990100', alamat_store: 'Gaia Bumi Raya City Lt. Ground No. 22, Pontianak', email_store: 'gaia.store@chocochips.id' },
  'Ciputra World Surabaya': { nama: 'Ciputra World Surabaya', kode: 'CWS', no_wa: '081288990111', alamat_store: 'Ciputra World Surabaya Lt. 2 Unit 214, Surabaya', email_store: 'cws.store@chocochips.id' },
  'Pakuwon Mall Surabaya': { nama: 'Pakuwon Mall Surabaya', kode: 'PMS', no_wa: '081288990122', alamat_store: 'Pakuwon Mall Lt. 1 No. 152, Surabaya', email_store: 'pms.store@chocochips.id' },
  'Tunjungan Plaza Surabaya': { nama: 'Tunjungan Plaza Surabaya', kode: 'TP', no_wa: '081288990133', alamat_store: 'Tunjungan Plaza 3 Lt. 3 No. 308, Surabaya', email_store: 'tp.store@chocochips.id' },
  'Deli Park Medan': { nama: 'Deli Park Medan', kode: 'DPM', no_wa: '081288990144', alamat_store: 'Deli Park Mall Lt. LG Unit 12, Medan', email_store: 'dpm.store@chocochips.id' },
  'Sun Plaza Medan': { nama: 'Sun Plaza Medan', kode: 'SPM', no_wa: '081288990155', alamat_store: 'Sun Plaza Lt. 1 No. 118, Medan', email_store: 'spm.store@chocochips.id' },
  'Paskal Hyper Square Bandung': { nama: 'Paskal Hyper Square Bandung', kode: 'PHB', no_wa: '081288990166', alamat_store: '23 Paskal Shopping Center Lt. 1 No. 122, Bandung', email_store: 'phb.store@chocochips.id' },
  'Kyte': { nama: 'Kyte', kode: 'KYTE', no_wa: '081288990177', alamat_store: 'Kyte Flagship Store No. 5, Jakarta', email_store: 'kyte.store@chocochips.id' },
};

export function getAllStoreContacts(): Record<string, OutletContactInfo> {
  let savedContacts: Record<string, OutletContactInfo> = {};
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem('wms_store_contacts_directory');
      if (raw) savedContacts = JSON.parse(raw);
    } catch {}
  }
  return { ...DEFAULT_STORE_CONTACTS, ...savedContacts };
}

/**
 * Mengambil informasi kontak store resmi (termasuk override localStorage)
 */
export function getStoreContact(storeNameOrCode?: string): OutletContactInfo {
  const fullName = getFullStoreName(storeNameOrCode);
  let savedContacts: Record<string, OutletContactInfo> = {};
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem('wms_store_contacts_directory');
      if (raw) savedContacts = JSON.parse(raw);
    } catch {}
  }

  // 1. Jika terdaftar di kontak tersimpan (termasuk jika nilainya dikosongkan pengguna), gunakan kontak tersimpan
  if (savedContacts[fullName]) return savedContacts[fullName];

  // 2. Pencarian case-insensitive di savedContacts
  const lower = fullName.toLowerCase();
  const savedMatch = Object.values(savedContacts).find(
    c => c.nama.toLowerCase() === lower || c.kode.toLowerCase() === lower
  );
  if (savedMatch) return savedMatch;

  // 3. Fallback ke DEFAULT_STORE_CONTACTS
  if (DEFAULT_STORE_CONTACTS[fullName]) return DEFAULT_STORE_CONTACTS[fullName];

  const defaultMatch = Object.values(DEFAULT_STORE_CONTACTS).find(
    c => c.nama.toLowerCase() === lower || c.kode.toLowerCase() === lower
  );
  if (defaultMatch) return defaultMatch;

  return {
    nama: fullName || 'Store',
    kode: 'STORE',
    no_wa: '',
    alamat_store: '',
    email_store: '',
    pic_default: 'PIC Store'
  };
}

/**
 * Menyimpan / memperbarui nomor telepon WhatsApp resmi store
 */
export function saveStoreContact(storeName: string, noWa?: string, alamat?: string, email?: string, pic?: string, kode?: string): void {
  const fullName = getFullStoreName(storeName);
  if (!fullName) return;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      let savedContacts: Record<string, OutletContactInfo> = {};
      const raw = localStorage.getItem('wms_store_contacts_directory');
      if (raw) savedContacts = JSON.parse(raw);
      const existing = savedContacts[fullName] || DEFAULT_STORE_CONTACTS[fullName] || {
        nama: fullName,
        kode: kode || Object.keys(STORE_CODE_TO_FULL_NAME).find(k => STORE_CODE_TO_FULL_NAME[k] === fullName) || 'STORE',
        no_wa: '',
        alamat_store: '',
        email_store: '',
        pic_default: 'Tim Store'
      };
      savedContacts[fullName] = {
        ...existing,
        nama: fullName,
        kode: kode ? kode.trim().toUpperCase() : existing.kode,
        no_wa: noWa !== undefined ? noWa.trim() : existing.no_wa,
        alamat_store: alamat !== undefined ? alamat.trim() : existing.alamat_store,
        email_store: email !== undefined ? email.trim() : existing.email_store,
        pic_default: pic !== undefined ? pic.trim() : existing.pic_default
      };
      localStorage.setItem('wms_store_contacts_directory', JSON.stringify(savedContacts));
      window.dispatchEvent(new CustomEvent('wms_store_contacts_updated', { detail: savedContacts }));
      // Background sync to Cloud Supabase wms_system_docs with valid on_conflict param
      supabaseFetch('wms_system_docs', 'POST', [{
        section_id: 'store_contacts_directory',
        content: JSON.stringify(savedContacts),
        updated_by: 'Master Pengaturan Toko',
        updated_at: new Date().toISOString()
      }], 'on_conflict=section_id').catch(() => {});
    } catch {}
  }
}

export interface StoreFulfillmentGroup {
  storeName: string;
  phone: string;
  pic: string;
  items: ManualShipmentItem[];
  isInterStore: boolean;
  isGudangGroup?: boolean;
}

/**
 * Mendeteksi toko asal barang yang sebenarnya (source store / fulfillment) vs toko pemohon pesanan
 */
export function resolveOrderSourceStore(order: ManualShipmentOrder): {
  sourceStoreName: string;
  isInterStoreFulfillment: boolean;
  requesterStoreName: string;
  phone: string;
  pic: string;
  itemsFromSource: typeof order.items;
} {
  const requester = order.nama_pengirim || 'Store Pemohon';
  const requesterFull = getFullStoreName(requester);
  const arOrigin = order.alteration_repair_data?.nama_asal;

  // Cari apakah ada item yang difulfill oleh store lain
  const storeItems = (order.items || []).filter(it => {
    const f = (it.fulfillment || '').trim();
    return f && f.toLowerCase() !== 'marketplace' && f.toLowerCase() !== 'gudang' && f.toLowerCase() !== 'warehouse';
  });

  const interStoreItem = storeItems.find(it => {
    return !isSameStore(it.fulfillment, requesterFull);
  });

  let targetStore = requesterFull;
  let isInterStore = false;

  if (interStoreItem && interStoreItem.fulfillment) {
    targetStore = getFullStoreName(interStoreItem.fulfillment);
    isInterStore = true;
  } else if (arOrigin && !isSameStore(arOrigin, requesterFull)) {
    targetStore = getFullStoreName(arOrigin);
    isInterStore = true;
  }

  const contact = getStoreContact(targetStore);
  const phone = contact?.no_wa || (isSameStore(targetStore, requesterFull) ? order.no_telp_store : '') || '';
  const pic = contact?.pic_default || (isSameStore(targetStore, requesterFull) ? order.pic_store : '') || '';

  const itemsFromSource = isInterStore
    ? (order.items || []).filter(it => isSameStore(it.fulfillment, targetStore))
    : (order.items || []);

  return {
    sourceStoreName: targetStore,
    isInterStoreFulfillment: isInterStore,
    requesterStoreName: requesterFull,
    phone,
    pic,
    itemsFromSource: itemsFromSource.length > 0 ? itemsFromSource : (order.items || []),
  };
}

/**
 * Mendeteksi seluruh grup toko fulfillment yang menyediakan barang untuk suatu pesanan.
 * Digunakan jika 1 pesanan diambil dari beberapa store berbeda (multi-store fulfillment).
 */
export function resolveOrderFulfillmentStores(order: ManualShipmentOrder): {
  groups: StoreFulfillmentGroup[];
  requesterStoreName: string;
  hasMultipleFulfillments: boolean;
} {
  const requester = order.nama_pengirim || 'Store Pemohon';
  const requesterFull = getFullStoreName(requester);
  const items = order.items || [];

  const groupsMap = new Map<string, ManualShipmentItem[]>();

  items.forEach((it) => {
    const rawFul = (it.fulfillment || '').trim();
    const fulLower = rawFul.toLowerCase();

    let targetStore: string;

    if (fulLower === 'marketplace' || fulLower === 'gudang' || fulLower === 'warehouse') {
      targetStore = 'Gudang Utama (Marketplace)';
    } else if (rawFul) {
      targetStore = getFullStoreName(rawFul);
    } else if (order.alteration_repair_data?.nama_asal) {
      targetStore = getFullStoreName(order.alteration_repair_data.nama_asal);
    } else {
      targetStore = requesterFull;
    }

    if (!groupsMap.has(targetStore)) {
      groupsMap.set(targetStore, []);
    }
    groupsMap.get(targetStore)!.push(it);
  });

  if (groupsMap.size === 0) {
    groupsMap.set(requesterFull, items);
  }

  const groups: StoreFulfillmentGroup[] = [];
  groupsMap.forEach((groupItems, storeName) => {
    const isGudangGroup = storeName.toLowerCase().includes('gudang utama');
    const contact = isGudangGroup ? null : getStoreContact(storeName);
    const phone = contact?.no_wa || (!isGudangGroup && isSameStore(storeName, requesterFull) ? (order.no_telp_store || '') : '') || '';
    const pic = contact?.pic_default || (!isGudangGroup && isSameStore(storeName, requesterFull) ? (order.pic_store || '') : '') || '';
    const isInterStore = !isGudangGroup && !isSameStore(storeName, requesterFull);

    groups.push({
      storeName,
      phone,
      pic,
      items: groupItems,
      isInterStore,
      isGudangGroup,
    });
  });

  return {
    groups,
    requesterStoreName: requesterFull,
    hasMultipleFulfillments: groups.length > 1,
  };
}

export function cleanJasaKirimName(name?: string): string {
  if (!name) return '';
  let cleaned = name.replace(/\s*\([^)]*\)/g, '').trim();
  if (cleaned === 'Drop ke Store Terkait') return 'Drop ke Store';
  return cleaned;
}

export const DEFAULT_JASA_KIRIM: string[] = [
  'JNE Regular',
  'JNE YES',
  'GOSEND',
  'Kurir Internal',
  'Drop ke Store',
];

export async function fetchJasaKirimList(): Promise<string[]> {
  try {
    const raw = localStorage.getItem('wms_cached_jasa_kirim');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = Array.from(new Set(parsed.map(cleanJasaKirimName).filter(Boolean)));
        if (cleaned.length > 0) {
          localStorage.setItem('wms_cached_jasa_kirim', JSON.stringify(cleaned));
          return cleaned;
        }
      }
    }
  } catch {}
  localStorage.setItem('wms_cached_jasa_kirim', JSON.stringify(DEFAULT_JASA_KIRIM));
  return DEFAULT_JASA_KIRIM;
}

function getDeletedOutletNames(): Set<string> {
  const set = new Set<string>();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem('wms_deleted_outlets');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.forEach((n: string) => set.add(String(n).trim().toLowerCase()));
        }
      }
    } catch {}
  }
  return set;
}

export interface OutletItem {
  id?: string;
  nama: string;
  fulfillment?: string;
  kode?: string;
  no_wa?: string;
  alamat_store?: string;
  email_store?: string;
  pic_default?: string;
}

export async function fetchOutlets(): Promise<OutletItem[]> {
  const deletedSet = getDeletedOutletNames();
  // Sync kontak & deleted outlets dari cloud wms_system_docs jika tersedia
  if (typeof window !== 'undefined') {
    try {
      const docList = await supabaseFetch<any[]>('wms_system_docs', 'GET', null, 'section_id=in.(store_contacts_directory,deleted_outlets_directory)');
      if (docList && docList.length > 0) {
        docList.forEach(docData => {
          if (docData.section_id === 'store_contacts_directory' && docData.content) {
            try {
              const parsed = JSON.parse(docData.content);
              const localRaw = localStorage.getItem('wms_store_contacts_directory');
              const localContacts = localRaw ? JSON.parse(localRaw) : {};
              const merged = { ...localContacts, ...parsed };
              // Auto-heal jika kode Gading Serpong Tangerang sempat tertimpa menjadi SMS
              if (merged['Gading Serpong Tangerang'] && merged['Gading Serpong Tangerang'].kode === 'SMS') {
                merged['Gading Serpong Tangerang'].kode = 'GST';
              }
              localStorage.setItem('wms_store_contacts_directory', JSON.stringify(merged));
            } catch {}
          }
          if (docData.section_id === 'deleted_outlets_directory' && docData.content) {
            try {
              const parsedDel = JSON.parse(docData.content);
              if (Array.isArray(parsedDel)) {
                const localRawDel = localStorage.getItem('wms_deleted_outlets');
                const localDel: string[] = localRawDel ? JSON.parse(localRawDel) : [];
                const mergedDel = Array.from(new Set([...localDel, ...parsedDel]));
                localStorage.setItem('wms_deleted_outlets', JSON.stringify(mergedDel));
                mergedDel.forEach(d => deletedSet.add(d.toLowerCase()));
              }
            } catch {}
          }
        });
      }
    } catch {}
  }

  try {
    const result: OutletItem[] = [];
    const seenNames = new Set<string>();

    // 1. Ambil dari outlet_config jika ada
    const data = await supabaseFetch<any[]>('outlet_config', 'GET', null, 'select=*&order=nama.asc');
    if (data && data.length > 0) {
      data.forEach(d => {
        if (d.nama) {
          const rawName = d.nama.trim();
          const fullName = getFullStoreName(rawName);
          const nameLower = fullName.toLowerCase();
          if (deletedSet.has(nameLower) || deletedSet.has(rawName.toLowerCase())) {
            return; // Lewati jika sudah dihapus pengguna
          }
          const contact = getStoreContact(fullName);
          const defaultCode = Object.keys(STORE_CODE_TO_FULL_NAME).find(
            k => STORE_CODE_TO_FULL_NAME[k].toLowerCase() === nameLower
          );
          const kode =
            d.kode ||
            (contact.kode && contact.kode !== 'STORE' ? contact.kode : '') ||
            defaultCode ||
            rawName
              .split(/\s+/)
              .filter(Boolean)
              .map((w: string) => w[0]?.toUpperCase() || '')
              .join('')
              .slice(0, 4) ||
            rawName.toUpperCase();
          if (!seenNames.has(nameLower)) {
            seenNames.add(nameLower);
            result.push({
              id: d.id,
              nama: fullName,
              fulfillment: d.fulfillment || fullName,
              kode: kode,
              no_wa: contact.no_wa || '',
              alamat_store: contact.alamat_store || '',
              email_store: contact.email_store || '',
              pic_default: contact.pic_default || '',
            });
          }
        }
      });
      return result;
    }

    // 2. Gabungkan dengan DEFAULT_OUTLETS jika database kosong dan belum pernah dihapus
    DEFAULT_OUTLETS.forEach(d => {
      const nameLower = d.nama.toLowerCase();
      if (!seenNames.has(nameLower) && !deletedSet.has(nameLower)) {
        seenNames.add(nameLower);
        const contact = getStoreContact(d.nama);
        result.push({
          nama: d.nama,
          fulfillment: d.fulfillment,
          kode: d.kode,
          no_wa: contact.no_wa || '',
          alamat_store: contact.alamat_store || '',
          email_store: contact.email_store || '',
          pic_default: contact.pic_default || '',
        });
      }
    });

    return result;
  } catch (err) {
    console.warn('Error fetching outlets', err);
  }
  return DEFAULT_OUTLETS.filter(d => !deletedSet.has(d.nama.toLowerCase())).map(d => {
    const contact = getStoreContact(d.nama);
    return {
      nama: d.nama,
      fulfillment: d.fulfillment,
      kode: d.kode,
      no_wa: contact.no_wa || '',
      alamat_store: contact.alamat_store || '',
      email_store: contact.email_store || '',
      pic_default: contact.pic_default || '',
    };
  });
}

export async function saveOutlet(outlet: { id?: string; nama: string; fulfillment?: string; kode?: string; no_wa?: string; alamat_store?: string; email_store?: string; pic_default?: string }): Promise<{ success: boolean; message: string }> {
  try {
    const cleanName = outlet.nama.trim();
    // Simpan kontak WA, Alamat, & Email ke direktori lokal & sinkronisasi
    saveStoreContact(cleanName, outlet.no_wa || '', outlet.alamat_store, outlet.email_store, outlet.pic_default, outlet.kode || '');

    // Jika sebelumnya pernah dihapus, bersihkan dari daftar terhapus
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem('wms_deleted_outlets');
        if (raw) {
          const arr = JSON.parse(raw);
          const filtered = arr.filter((n: string) => n.toLowerCase() !== cleanName.toLowerCase());
          localStorage.setItem('wms_deleted_outlets', JSON.stringify(filtered));
          supabaseFetch('wms_system_docs', 'POST', [{
            section_id: 'deleted_outlets_directory',
            content: JSON.stringify(filtered),
            updated_by: 'Master Pengaturan Toko',
            updated_at: new Date().toISOString()
          }], 'on_conflict=section_id').catch(() => {});
        }
      } catch {}
    }

    if (outlet.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(outlet.id)) {
      await supabaseFetch('outlet_config', 'PATCH', {
        nama: cleanName,
        fulfillment: (outlet.fulfillment || cleanName).trim()
      }, `id=eq.${encodeURIComponent(outlet.id)}`);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('wms_outlets_updated'));
      return { success: true, message: 'Berhasil mengupdate store dan kontak WhatsApp' };
    } else {
      await supabaseFetch('outlet_config', 'POST', [{
        nama: cleanName,
        fulfillment: (outlet.fulfillment || cleanName).trim(),
        created_at: new Date().toISOString()
      }]);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('wms_outlets_updated'));
      return { success: true, message: 'Berhasil menambahkan store dan kontak WhatsApp baru' };
    }
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menyimpan data store' };
  }
}

export async function deleteOutlet(idOrName: string, nameFallback?: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!idOrName) return { success: false, message: 'ID atau nama store tidak valid' };

    const targetName = (nameFallback || idOrName).trim();
    // 1. Simpan ke blacklist store terhapus agar tidak muncul lagi dari default list
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem('wms_deleted_outlets');
        const list: string[] = raw ? JSON.parse(raw) : [];
        const cleanLower = targetName.toLowerCase();
        if (!list.includes(cleanLower)) {
          list.push(cleanLower);
          localStorage.setItem('wms_deleted_outlets', JSON.stringify(list));
        }
        // Background sync to Cloud Supabase
        supabaseFetch('wms_system_docs', 'POST', [{
          section_id: 'deleted_outlets_directory',
          content: JSON.stringify(list),
          updated_by: 'Master Pengaturan Toko',
          updated_at: new Date().toISOString()
        }], 'on_conflict=section_id').catch(() => {});
      } catch {}
    }

    // 2. Hapus dari Supabase outlet_config
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName.trim());
    if (isUuid) {
      await supabaseFetch('outlet_config', 'DELETE', null, `id=eq.${encodeURIComponent(idOrName)}`);
    } else {
      await supabaseFetch('outlet_config', 'DELETE', null, `nama=eq.${encodeURIComponent(idOrName)}`);
    }

    if (nameFallback && nameFallback !== idOrName) {
      try {
        await supabaseFetch('outlet_config', 'DELETE', null, `nama=eq.${encodeURIComponent(nameFallback)}`);
      } catch {}
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wms_outlets_updated'));
    }

    return { success: true, message: `Berhasil menghapus store "${targetName}"` };
  } catch (err: any) {
    console.error('Error deleting outlet:', err);
    return { success: false, message: err.message || 'Gagal menghapus store' };
  }
}

export async function submitManualShipment(payload: ManualShipmentOrder): Promise<{ success: boolean; message: string }> {
  try {
    const { id, history_logs, alteration_repair_data, ...rest } = payload as any;
    let notes = rest.notes_paket || '';
    
    // 1. Simpan metadata Alteration & Repair ke notes_paket jika ada
    const arData = alteration_repair_data || (payload.order_type === 'alteration_repair' ? {
      layanan_type: payload.layanan_type || 'both',
      sumber_barang: (payload as any).sumber_barang || 'store',
      nama_asal: (payload as any).nama_asal || payload.nama_pengirim,
      pic_pemohon: (payload as any).pic_pemohon || payload.pic_store || payload.submitted_by || '',
      lokasi_rak: (payload as any).lokasi_rak || '',
      nama_customer: payload.nama_tujuan || '',
      nama_sa: payload.pic_store || payload.submitted_by || '',
      no_hp: payload.no_telp_tujuan || '',
      toko: payload.nama_pengirim,
      nama_produk: payload.items?.[0]?.nama_produk || '',
      sku: payload.items?.[0]?.sku || '',
      size: payload.items?.[0]?.size || '-',
      qty: Number(payload.items?.[0]?.qty) || 1,
      kondisi: payload.kondisi || '',
      perkiraan_selesai: payload.perkiraan_selesai || '',
      alteration_detail: payload.alteration_detail || '',
      repair_detail: payload.repair_detail || '',
      pic_warehouse: (payload as any).pic_warehouse || '',
      status_flow: (payload as any).status_flow || 'diajukan',
      flow_logs: (payload as any).flow_logs || [
        {
          id: `flow-${Date.now()}`,
          stage: 'diajukan',
          timestamp: new Date().toISOString(),
          actor_name: payload.pic_store || payload.submitted_by || 'PIC Pemohon',
          notes: 'Request Alter & Repair diajukan',
        }
      ],
      is_agreed_terms: payload.is_agreed_terms ?? true,
      is_condition_confirmed: payload.is_condition_confirmed ?? true,
      foto_urls: payload.foto_urls || [],
    } : null);

    if (arData) {
      try {
        const arTag = `\n[ALTERATION_REPAIR]:${JSON.stringify(arData)}`;
        if (!notes.includes('[ALTERATION_REPAIR]:')) {
          notes = notes ? `${notes}${arTag}` : arTag.trim();
        }
      } catch {}
    }

    // 2. Format JSON notes_paket jika ada history_logs
    if (history_logs && history_logs.length > 0) {
      try {
        const histTag = `\n[HISTORI_LOGS]:${JSON.stringify(history_logs)}`;
        if (!notes.includes('[HISTORI_LOGS]:')) {
          notes = notes ? `${notes}${histTag}` : histTag.trim();
        }
      } catch {}
    }

    // 3. Format JSON notes_paket jika ada store_metadata (jadwal kirim store & status cetak)
    const storeMeta: any = {};
    if (payload.tgl_jadwal_kirim_store) storeMeta.tgl_jadwal_kirim_store = payload.tgl_jadwal_kirim_store;
    if (payload.catatan_jadwal_store) storeMeta.catatan_jadwal_store = payload.catatan_jadwal_store;
    if (payload.tujuan_pengiriman) storeMeta.tujuan_pengiriman = payload.tujuan_pengiriman;
    if (payload.is_picking_printed) storeMeta.is_picking_printed = payload.is_picking_printed;
    if (payload.is_label_printed) storeMeta.is_label_printed = payload.is_label_printed;
    if (payload.tgl_cetak_picking) storeMeta.tgl_cetak_picking = payload.tgl_cetak_picking;
    if (payload.tgl_cetak_label) storeMeta.tgl_cetak_label = payload.tgl_cetak_label;

    if (Object.keys(storeMeta).length > 0) {
      try {
        const metaTag = `\n[STORE_METADATA]:${JSON.stringify(storeMeta)}`;
        if (!notes.includes('[STORE_METADATA]:')) {
          notes = notes ? `${notes}${metaTag}` : metaTag.trim();
        }
      } catch {}
    }

    const submitPayload: any = {
      ...rest,
      items: Array.isArray(rest.items)
        ? rest.items.map((it: any) => ({
            ...it,
            no_sj_dealpos: '',
          }))
        : rest.items,
      notes_paket: notes,
      created_at: payload.created_at || new Date().toISOString()
    };

    // Pastikan status mematuhi check constraint Supabase ('diterima', 'diproses', 'dikirim', 'batal', 'DELETED')
    if (!submitPayload.status || submitPayload.status === 'pending') {
      submitPayload.status = 'diterima';
    } else if (submitPayload.status === 'selesai') {
      submitPayload.status = 'dikirim';
    }

    // Pastikan tidak mengirim properti transient yang tidak ada di schema
    delete submitPayload.layanan_type;
    delete submitPayload.kondisi;
    delete submitPayload.perkiraan_selesai;
    delete submitPayload.alteration_detail;
    delete submitPayload.repair_detail;
    delete submitPayload.is_agreed_terms;
    delete submitPayload.is_condition_confirmed;
    delete submitPayload.foto_urls;
    delete submitPayload.order_type;
    delete submitPayload.sumber_barang;
    delete submitPayload.nama_asal;
    delete submitPayload.pic_pemohon;
    delete submitPayload.lokasi_rak;
    delete submitPayload.pic_warehouse;
    delete submitPayload.status_flow;
    delete submitPayload.flow_logs;
    
    // Hapus field tambahan dari UI yang tidak ada di schema DB (pic_store ada di schema)
    delete submitPayload.email_customer;
    delete submitPayload.email_store;
    delete submitPayload.tujuan_pengiriman;
    delete submitPayload.tgl_jadwal_kirim_store;
    delete submitPayload.catatan_jadwal_store;
    delete submitPayload.is_picking_printed;
    delete submitPayload.is_label_printed;
    delete submitPayload.tgl_cetak_picking;
    delete submitPayload.tgl_cetak_label;

    if (submitPayload.pic_store !== undefined && submitPayload.pic_store !== null) {
      submitPayload.pic_store = String(submitPayload.pic_store).trim();
    }

    // Tandai di perangkat PIC penginput agar HP/perangkat penginput tidak memunculkan alarm notifikasi pesanan baru ke diri sendiri
    globalRealtimeStore.markOrderSubmittedLocally(submitPayload.no_pesanan);
    globalRealtimeStore.markOrderSubmittedLocally(submitPayload.no_transaksi_customer);

    await supabaseFetch('manual_shipment', 'POST', [submitPayload]);

    // Broadcast instan ke Laptop & HP Admin yang sedang aktif (< 100ms)
    globalRealtimeStore.broadcastEvent('new_manual_shipment', submitPayload).catch(() => {});

    return { success: true, message: 'Berhasil menyimpan data ke Supabase' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menyimpan ke Supabase' };
  }
}

export async function fetchManualShipments(): Promise<ManualShipmentOrder[]> {
  try {
    const data = await supabaseFetch<any[]>('manual_shipment', 'GET', null, 'select=*&order=created_at.desc');
    if (!data) return [];
    
    const nonReturData = data.filter(item => {
      const noPesanan = String(item.no_pesanan || '').toUpperCase().trim();
      const rawNotes = String(item.notes_paket || '');
      if (noPesanan.startsWith('RTR-') || rawNotes.includes('[RETUR_BARANG]:')) {
        return false;
      }
      return true;
    });

    return nonReturData.map(item => {
      let history_logs: ManualShipmentHistoryLog[] = [];
      let alteration_repair_data: any = undefined;
      let store_metadata: any = undefined;
      let notes = item.notes_paket || '';
      
      // 1. Ekstrak [ALTERATION_REPAIR]
      if (notes.includes('[ALTERATION_REPAIR]:')) {
        const parts = notes.split('[ALTERATION_REPAIR]:');
        notes = parts[0].trim();
        const remain = parts[1] || '';
        const nextIdx = remain.search(/\[(HISTORI_LOGS|STORE_METADATA)\]:/);
        const jsonStr = nextIdx !== -1 ? remain.substring(0, nextIdx) : remain;
        try {
          alteration_repair_data = JSON.parse(jsonStr.trim());
        } catch {}
        if (nextIdx !== -1) {
          notes += '\n' + remain.substring(nextIdx);
        }
      }

      // 2. Ekstrak [HISTORI_LOGS]
      if (notes.includes('[HISTORI_LOGS]:')) {
        const parts = notes.split('[HISTORI_LOGS]:');
        notes = parts[0].trim();
        const remain = parts[1] || '';
        const nextIdx = remain.search(/\[STORE_METADATA\]:/);
        const jsonStr = nextIdx !== -1 ? remain.substring(0, nextIdx) : remain;
        try {
          history_logs = JSON.parse(jsonStr.trim());
        } catch {}
        if (nextIdx !== -1) {
          notes += '\n' + remain.substring(nextIdx);
        }
      }

      // 3. Ekstrak [STORE_METADATA]
      if (notes.includes('[STORE_METADATA]:')) {
        const parts = notes.split('[STORE_METADATA]:');
        notes = parts[0].trim();
        try {
          store_metadata = JSON.parse(parts[1].trim());
        } catch {}
      }

      // Deteksi order_type (Pesanan MS... adalah manual_shipment meskipun memiliki metadata kirim WH / alter)
      const noPesanan = (item.no_pesanan || '').toUpperCase();
      const isMsPrefix = noPesanan.startsWith('MS');
      const isArPrefix = noPesanan.startsWith('AR-') || noPesanan.startsWith('REP-') || noPesanan.startsWith('ALT-');
      const isAlterationRepair = !isMsPrefix && (isArPrefix || hasValidArData(alteration_repair_data));
      const order_type = isAlterationRepair ? 'alteration_repair' : 'manual_shipment';

      // Parse & normalize items array (bisa berupa Array, string JSON, atau flat properties)
      let rawItems: any = item.items;
      if (typeof rawItems === 'string' && rawItems.trim()) {
        try {
          rawItems = JSON.parse(rawItems);
        } catch {}
      }

      const storeTxList: string[] = Array.isArray(item.no_transaksi_pengirim)
        ? item.no_transaksi_pengirim.map((t: any) => String(t || '').trim().toLowerCase()).filter(Boolean)
        : item.no_transaksi_pengirim
          ? String(item.no_transaksi_pengirim).split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
          : [];

      let parsedItems: ManualShipmentItem[] = (Array.isArray(rawItems) ? rawItems : []).map((it: any) => {
        const rawSj = String(it?.no_sj_dealpos || '').trim();
        // Jangan pernah menganggap No. Transaksi DealPOS Store sebagai No. SJ DealPOS Admin WH
        const isDuplicateStoreTx = rawSj && storeTxList.includes(rawSj.toLowerCase()) && !it?.sj_updated_by;
        return {
          ...it,
          no_sj_dealpos: isDuplicateStoreTx ? '' : rawSj,
        };
      });

      if (parsedItems.length === 0 && (item.sku || item.nama_produk)) {
        parsedItems = [{
          id: item.id || `item-1`,
          sku: item.sku || '',
          nama_produk: item.nama_produk || '',
          size: item.size || 'Default',
          qty: Number(item.qty) || 1,
          fulfillment: item.nama_pengirim || '',
        }];
      }

      return {
        ...item,
        items: parsedItems,
        order_type,
        notes_paket: notes,
        alteration_repair_data,
        layanan_type: alteration_repair_data?.layanan_type || (item.layanan_type || 'both'),
        sumber_barang: alteration_repair_data?.sumber_barang || 'store',
        nama_asal: alteration_repair_data?.nama_asal || item.nama_pengirim || '',
        pic_pemohon: alteration_repair_data?.pic_pemohon || item.pic_store || item.submitted_by || '',
        lokasi_rak: alteration_repair_data?.lokasi_rak || '',
        pic_warehouse: alteration_repair_data?.pic_warehouse || '',
        status_flow: alteration_repair_data?.status_flow || 'diajukan',
        flow_logs: alteration_repair_data?.flow_logs || [],
        kondisi: alteration_repair_data?.kondisi || item.kondisi || '',
        perkiraan_selesai: alteration_repair_data?.perkiraan_selesai || item.perkiraan_selesai || '',
        alteration_detail: alteration_repair_data?.alteration_detail || item.alteration_detail || '',
        repair_detail: alteration_repair_data?.repair_detail || item.repair_detail || '',
        is_agreed_terms: alteration_repair_data?.is_agreed_terms ?? item.is_agreed_terms,
        is_condition_confirmed: alteration_repair_data?.is_condition_confirmed ?? item.is_condition_confirmed,
        foto_urls: alteration_repair_data?.foto_urls || item.foto_urls || [],
        history_logs: history_logs.length > 0 ? history_logs : (item.history_logs || []),
        // Metadata jadwal kirim ke store & status cetak
        tgl_jadwal_kirim_store: store_metadata?.tgl_jadwal_kirim_store || item.tgl_jadwal_kirim_store || alteration_repair_data?.tgl_kirim_kembali || (item as any).tgl_kirim_store || '',
        catatan_jadwal_store: store_metadata?.catatan_jadwal_store || (item as any).catatan_jadwal_store || '',
        tujuan_pengiriman: store_metadata?.tujuan_pengiriman || (item as any).tujuan_pengiriman || alteration_repair_data?.tujuan_pengembalian || undefined,
        is_picking_printed: !!(store_metadata?.is_picking_printed || (item as any).is_picking_printed),
        is_label_printed: !!(store_metadata?.is_label_printed || (item as any).is_label_printed),
        tgl_cetak_picking: store_metadata?.tgl_cetak_picking || (item as any).tgl_cetak_picking || '',
        tgl_cetak_label: store_metadata?.tgl_cetak_label || (item as any).tgl_cetak_label || '',
      } as ManualShipmentOrder;
    });
  } catch (err) {
    console.warn('Error fetching manual shipments', err);
    return [];
  }
}

export async function updateShipmentStatus(idOrNoPesanan: string, status: string): Promise<boolean> {
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrNoPesanan);
    const filter = isUuid ? `id=eq.${idOrNoPesanan}` : `no_pesanan=eq.${encodeURIComponent(idOrNoPesanan)}`;
    const dbStatus = status === 'selesai' ? 'dikirim' : (status === 'pending' ? 'diterima' : status);
    await supabaseFetch('manual_shipment', 'PATCH', { status: dbStatus }, filter);
    return true;
  } catch (err) {
    console.warn('Error updateShipmentStatus', err);
    return false;
  }
}

export async function updateShipmentResi(idOrNoPesanan: string, resi: string, timestamp?: string): Promise<boolean> {
  try {
    const payload: any = { 
      no_resi: resi,
      status: 'dikirim' // Auto-update status when resi is inputted
    };
    if (timestamp) {
      payload.tanggal_scan = timestamp;
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrNoPesanan);
    const filter = isUuid ? `id=eq.${idOrNoPesanan}` : `no_pesanan=eq.${encodeURIComponent(idOrNoPesanan)}`;
    try {
      await supabaseFetch('manual_shipment', 'PATCH', payload, filter);
    } catch (patchErr: any) {
      if (payload.tanggal_scan) {
        delete payload.tanggal_scan;
        await supabaseFetch('manual_shipment', 'PATCH', payload, filter);
      } else {
        throw patchErr;
      }
    }
    return true;
  } catch (err) {
    console.warn('Error updateShipmentResi', err);
    return false;
  }
}

export interface BulkResiUpdateItem {
  id?: string;
  no_pesanan: string;
  no_resi: string;
  status?: string;
  update_status_to_dikirim?: boolean;
}

export async function bulkUpdateShipmentResi(
  items: BulkResiUpdateItem[]
): Promise<{ successCount: number; failCount: number; errors: string[] }> {
  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];
  const nowIso = new Date().toISOString();

  // Process in small parallel chunks of 5 to ensure speed without overwhelming connections
  const chunkSize = 5;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (item) => {
        try {
          const cleanResi = (item.no_resi || '').trim();
          if (!cleanResi) return;

          const payload: any = {
            no_resi: cleanResi,
            tanggal_scan: nowIso,
          };

          if (item.update_status_to_dikirim) {
            payload.status = 'dikirim';
          } else if (item.status) {
            payload.status = item.status;
          }

          let filter = '';
          if (item.id) {
            filter = `id=eq.${item.id}`;
          } else if (item.no_pesanan) {
            filter = `no_pesanan=eq.${encodeURIComponent(item.no_pesanan)}`;
          } else {
            return;
          }

          try {
            await supabaseFetch('manual_shipment', 'PATCH', payload, filter);
          } catch (patchErr: any) {
            if (payload.tanggal_scan) {
              delete payload.tanggal_scan;
              await supabaseFetch('manual_shipment', 'PATCH', payload, filter);
            } else {
              throw patchErr;
            }
          }
          successCount++;
        } catch (err: any) {
          failCount++;
          errors.push(`${item.no_pesanan}: ${err?.message || 'Gagal update'}`);
        }
      })
    );
  }

  return { successCount, failCount, errors };
}

export async function deleteManualShipment(no_pesanan: string): Promise<boolean> {
  try {
    await supabaseFetch('manual_shipment', 'DELETE', null, `no_pesanan=eq.${no_pesanan}`);
    return true;
  } catch (err) {
    console.warn('Error deleteManualShipment', err);
    return false;
  }
}

export async function editManualShipment(payload: ManualShipmentOrder): Promise<{ success: boolean; message: string }> {
  try {
    if (!payload.id && !payload.no_pesanan) {
      return { success: false, message: 'ID atau No Pesanan tidak ditemukan untuk diupdate' };
    }
    const { id, history_logs, alteration_repair_data, ...rest } = payload as any;
    
    // Simpan metadata ke notes_paket
    let notes = (rest.notes_paket || '')
      .replace(/\n?\[ALTERATION_REPAIR\]:[\s\S]*?(?=\n\[(HISTORI_LOGS|STORE_METADATA)\]:|$)/, '')
      .replace(/\n?\[HISTORI_LOGS\]:[\s\S]*?(?=\n\[STORE_METADATA\]:|$)/, '')
      .replace(/\n?\[STORE_METADATA\]:[\s\S]*$/, '')
      .trim();

    const arData = alteration_repair_data || (payload.order_type === 'alteration_repair' ? {
      layanan_type: payload.layanan_type || 'both',
      sumber_barang: (payload as any).sumber_barang || 'store',
      nama_asal: (payload as any).nama_asal || payload.nama_pengirim,
      pic_pemohon: (payload as any).pic_pemohon || payload.pic_store || payload.submitted_by || '',
      lokasi_rak: (payload as any).lokasi_rak || '',
      nama_customer: payload.nama_tujuan || '',
      nama_sa: payload.pic_store || payload.submitted_by || '',
      no_hp: payload.no_telp_tujuan || '',
      toko: payload.nama_pengirim,
      nama_produk: payload.items?.[0]?.nama_produk || '',
      sku: payload.items?.[0]?.sku || '',
      size: payload.items?.[0]?.size || '-',
      qty: Number(payload.items?.[0]?.qty) || 1,
      kondisi: payload.kondisi || '',
      perkiraan_selesai: payload.perkiraan_selesai || '',
      alteration_detail: payload.alteration_detail || '',
      repair_detail: payload.repair_detail || '',
      pic_warehouse: (payload as any).pic_warehouse || '',
      status_flow: (payload as any).status_flow || 'diajukan',
      flow_logs: (payload as any).flow_logs || [],
      is_agreed_terms: payload.is_agreed_terms ?? true,
      is_condition_confirmed: payload.is_condition_confirmed ?? true,
      foto_urls: payload.foto_urls || [],
    } : null);

    if (arData) {
      try {
        const arTag = `\n[ALTERATION_REPAIR]:${JSON.stringify(arData)}`;
        notes = notes ? `${notes}${arTag}` : arTag.trim();
      } catch {}
    }

    if (history_logs && history_logs.length > 0) {
      try {
        const histTag = `\n[HISTORI_LOGS]:${JSON.stringify(history_logs)}`;
        notes = notes ? `${notes}${histTag}` : histTag.trim();
      } catch {}
    }

    // 3. Format JSON notes_paket jika ada store_metadata (jadwal kirim store & status cetak)
    const storeMeta: any = {};
    if (payload.tgl_jadwal_kirim_store) storeMeta.tgl_jadwal_kirim_store = payload.tgl_jadwal_kirim_store;
    if (payload.catatan_jadwal_store) storeMeta.catatan_jadwal_store = payload.catatan_jadwal_store;
    if (payload.tujuan_pengiriman) storeMeta.tujuan_pengiriman = payload.tujuan_pengiriman;
    if (payload.is_picking_printed !== undefined) storeMeta.is_picking_printed = payload.is_picking_printed;
    if (payload.is_label_printed !== undefined) storeMeta.is_label_printed = payload.is_label_printed;
    if (payload.tgl_cetak_picking) storeMeta.tgl_cetak_picking = payload.tgl_cetak_picking;
    if (payload.tgl_cetak_label) storeMeta.tgl_cetak_label = payload.tgl_cetak_label;

    if (Object.keys(storeMeta).length > 0) {
      try {
        const metaTag = `\n[STORE_METADATA]:${JSON.stringify(storeMeta)}`;
        // Hapus tag lama jika ada agar tidak duplikat
        if (notes.includes('[STORE_METADATA]:')) {
          const p = notes.split('[STORE_METADATA]:');
          notes = p[0].trim();
        }
        notes = notes ? `${notes}${metaTag}` : metaTag.trim();
      } catch {}
    }

    const patchPayload: any = {
      ...rest,
      notes_paket: notes,
      updated_at: new Date().toISOString()
    };

    if (patchPayload.status) {
      if (patchPayload.status === 'selesai') {
        patchPayload.status = 'dikirim';
      } else if (patchPayload.status === 'pending') {
        patchPayload.status = 'diterima';
      }
    }

    delete patchPayload.layanan_type;
    delete patchPayload.kondisi;
    delete patchPayload.perkiraan_selesai;
    delete patchPayload.alteration_detail;
    delete patchPayload.repair_detail;
    delete patchPayload.is_agreed_terms;
    delete patchPayload.is_condition_confirmed;
    delete patchPayload.foto_urls;
    delete patchPayload.order_type;
    delete patchPayload.sumber_barang;
    delete patchPayload.nama_asal;
    delete patchPayload.pic_pemohon;
    delete patchPayload.lokasi_rak;
    delete patchPayload.pic_warehouse;
    delete patchPayload.status_flow;
    delete patchPayload.flow_logs;
    
    // Hapus field tambahan UI yang tidak ada di schema DB (pic_store ada di schema)
    delete patchPayload.email_customer;
    delete patchPayload.email_store;
    delete patchPayload.tujuan_pengiriman;
    delete patchPayload.tgl_jadwal_kirim_store;
    delete patchPayload.catatan_jadwal_store;
    delete patchPayload.is_picking_printed;
    delete patchPayload.is_label_printed;
    delete patchPayload.tgl_cetak_picking;
    delete patchPayload.tgl_cetak_label;

    if (patchPayload.pic_store !== undefined && patchPayload.pic_store !== null) {
      patchPayload.pic_store = String(patchPayload.pic_store).trim();
    }

    const idOrNo = payload.id || payload.no_pesanan;
    const isUuid = idOrNo && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrNo);
    const filter = isUuid ? `id=eq.${idOrNo}` : `no_pesanan=eq.${encodeURIComponent(idOrNo || '')}`;

    await supabaseFetch('manual_shipment', 'PATCH', patchPayload, filter);
    return { success: true, message: 'Berhasil mengupdate data' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal mengupdate data' };
  }
}

/**
 * Update tanggal jadwal pengiriman pesanan kembali/ke Store (Opsi Kirim ke Store)
 */
export async function updateJadwalKirimStore(
  orderId: string,
  tglJadwal: string,
  catatan?: string,
  actor?: string
): Promise<{ success: boolean; message: string; updatedOrder?: ManualShipmentOrder }> {
  try {
    const orders = await fetchManualShipments();
    const order = orders.find(o => o.id === orderId || o.no_pesanan === orderId);
    if (!order) return { success: false, message: 'Pesanan tidak ditemukan' };

    const now = new Date().toISOString();
    const logs: ManualShipmentHistoryLog[] = Array.isArray(order.history_logs) ? [...order.history_logs] : [];
    
    logs.unshift({
      id: 'log-' + Date.now(),
      timestamp: now,
      actor: actor || 'Admin',
      action: 'edited',
      note: `Jadwal kirim ke store ditetapkan: ${tglJadwal}${catatan ? ` (Catatan: ${catatan})` : ''}`,
    });

    const updatedArData = order.alteration_repair_data ? {
      ...order.alteration_repair_data,
      tgl_kirim_kembali: tglJadwal,
      status_flow: 'siap_dikirim' as import('../types').AlterationFlowStage
    } : undefined;

    const updatedOrder: ManualShipmentOrder = {
      ...order,
      tgl_jadwal_kirim_store: tglJadwal,
      catatan_jadwal_store: catatan || order.catatan_jadwal_store || '',
      status: 'dikirim',
      alteration_repair_data: updatedArData,
      history_logs: logs
    };

    const res = await editManualShipment(updatedOrder);
    return { success: res.success, message: res.message, updatedOrder };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menyimpan jadwal kirim ke store' };
  }
}

/**
 * Update status cetak picking list atau label paket pesanan.
 * ATURAN 2 TAHAP CETAK: Pesanan baru ('diterima' / 'pending') hanya berpindah ke 'diproses'
 * apabila KEDUA tahapan cetak (Cetak Picking List DAN Cetak Label Paket) telah diselesaikan.
 */
export async function updateOrderPrintStatus(
  orderIds: string[],
  type: 'picking' | 'label' | 'spk'
): Promise<{ success: boolean; message: string }> {
  try {
    if (type === 'spk') {
      return { success: true, message: 'Status cetak SPK dicatat' };
    }

    const now = new Date().toISOString();
    const allOrders = await fetchManualShipments();

    await Promise.all(
      orderIds.map(async (idOrNo) => {
        try {
          const targetOrder = allOrders.find(
            (o) => o.id === idOrNo || o.no_pesanan === idOrNo
          );

          if (targetOrder) {
            const nextPickingPrinted = type === 'picking' ? true : !!targetOrder.is_picking_printed;
            const nextLabelPrinted = type === 'label' ? true : !!targetOrder.is_label_printed;
            const bothPrinted = nextPickingPrinted && nextLabelPrinted;

            const currentStatus = (targetOrder.status || 'diterima').toLowerCase().trim();
            const flowStr = (targetOrder.alteration_repair_data?.status_flow || '').toLowerCase();
            const isFlowAktif = ['dalam_pengerjaan', 'selesai_qc', 'diterima_warehouse', 'siap_dikirim'].includes(flowStr);
            const hasResiOrJadwal = !!(targetOrder.no_resi && targetOrder.no_resi.trim()) || !!(targetOrder.tgl_jadwal_kirim_store && targetOrder.tgl_jadwal_kirim_store.trim());
            let nextStatus = targetOrder.status;
            if (currentStatus !== 'batal' && currentStatus !== 'dikirim' && currentStatus !== 'selesai' && !hasResiOrJadwal) {
              if (bothPrinted || isFlowAktif) {
                nextStatus = 'diproses';
              } else {
                nextStatus = 'diterima';
              }
            }

            const updatedOrder: ManualShipmentOrder = {
              ...targetOrder,
              status: nextStatus,
              is_picking_printed: nextPickingPrinted,
              is_label_printed: nextLabelPrinted,
              tgl_cetak_picking: type === 'picking' ? now : (targetOrder.tgl_cetak_picking || ''),
              tgl_cetak_label: type === 'label' ? now : (targetOrder.tgl_cetak_label || ''),
            };

            await editManualShipment(updatedOrder);
          }
        } catch (e) {
          console.warn('Silent skip order print status patch for', idOrNo, e);
        }
      })
    );
    return { success: true, message: 'Status cetak berhasil diperbarui' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal memperbarui status cetak' };
  }
}

/**
 * Memperbarui tahapan flow Alteration & Repair oleh Warehouse
 */
export async function updateAlterationFlowStage(
  order: ManualShipmentOrder,
  newStage: import('../types').AlterationFlowStage,
  actorName: string,
  notes?: string,
  picWarehouse?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const prevData = order.alteration_repair_data || {} as any;
    const existingLogs = Array.isArray(prevData.flow_logs) ? [...prevData.flow_logs] : [];
    
    const newLog: import('../types').AlterationFlowLog = {
      id: `flow-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      stage: newStage,
      timestamp: new Date().toISOString(),
      actor_name: actorName,
      actor_role: 'Tim Warehouse',
      notes: notes || '',
    };
    existingLogs.push(newLog);

    const updatedArData: import('../types').AlterationRepairData = {
      ...prevData,
      status_flow: newStage,
      flow_logs: existingLogs,
      pic_warehouse: picWarehouse !== undefined ? picWarehouse : (prevData.pic_warehouse || actorName),
    };

    // Map stage ke status manual_shipment
    let newStatus: ManualShipmentOrder['status'] = order.status;
    if (newStage === 'diajukan' || newStage === 'diterima_warehouse') {
      newStatus = 'diterima';
    } else if (newStage === 'dalam_pengerjaan' || newStage === 'selesai_qc') {
      newStatus = 'diproses';
    } else if (newStage === 'siap_dikirim' || newStage === 'selesai') {
      newStatus = 'dikirim';
    }

    const updatedOrder: ManualShipmentOrder = {
      ...order,
      status: newStatus,
      alteration_repair_data: updatedArData,
    };

    return await editManualShipment(updatedOrder);
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal mengupdate status flow Alteration & Repair' };
  }
}

export async function updateItemSjDealpos(orderId: string, itemId: string, noSj: string, updatedBy?: string): Promise<{ success: boolean; message: string }> {
  try {
    const orders = await fetchManualShipments();
    const order = orders.find(o => o.id === orderId || o.no_pesanan === orderId);
    if (!order) return { success: false, message: 'Pesanan tidak ditemukan' };

    const updatedItems = (order.items || []).map(it => {
      if (it.id === itemId) {
        return {
          ...it,
          no_sj_dealpos: noSj.trim(),
          sj_updated_at: new Date().toISOString(),
          sj_updated_by: updatedBy || 'Admin'
        };
      }
      return it;
    });

    const res = await editManualShipment({ ...order, items: updatedItems });
    return res;
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal update No SJ DealPOS' };
  }
}

export async function bulkUpdateOrderSjDealpos(orderId: string, noSj: string, updatedBy?: string): Promise<{ success: boolean; message: string }> {
  try {
    const orders = await fetchManualShipments();
    const order = orders.find(o => o.id === orderId || o.no_pesanan === orderId);
    if (!order) return { success: false, message: 'Pesanan tidak ditemukan' };

    const updatedItems = (order.items || []).map(it => {
      const ful = (it.fulfillment || '').toLowerCase();
      const isTarget = ful.includes('marketplace') || ful.includes('gudang') || ful.includes('warehouse') || order.no_pesanan?.startsWith('AR-') || !ful;
      if (isTarget) {
        return {
          ...it,
          no_sj_dealpos: noSj.trim(),
          sj_updated_at: new Date().toISOString(),
          sj_updated_by: updatedBy || 'Admin'
        };
      }
      return it;
    });

    const res = await editManualShipment({ ...order, items: updatedItems });
    return res;
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal bulk update No SJ DealPOS' };
  }
}

export async function markItemSoldAndProcess(
  orderId: string,
  itemId: string,
  resolution: 'mark_only' | 'partial_fulfill' | 'cancel_order',
  note: string,
  actor: string
): Promise<{ success: boolean; message: string; updatedOrder?: ManualShipmentOrder }> {
  try {
    const orders = await fetchManualShipments();
    const order = orders.find(o => o.id === orderId || o.no_pesanan === orderId);
    if (!order) return { success: false, message: 'Pesanan tidak ditemukan' };

    const targetItem = (order.items || []).find(it => it.id === itemId);
    if (!targetItem) return { success: false, message: 'Item produk tidak ditemukan' };

    const now = new Date().toISOString();
    const logs: ManualShipmentHistoryLog[] = order.history_logs || [];

    let updatedStatus = order.status;
    let newItems = [...(order.items || [])];

    if (resolution === 'cancel_order') {
      // Batalkan seluruh pesanan
      updatedStatus = 'batal';
      newItems = newItems.map(it => {
        if (it.id === itemId) {
          return {
            ...it,
            item_status: 'sold_out' as const,
            sold_note: note,
            sold_at: now,
            sold_by: actor
          };
        }
        return {
          ...it,
          item_status: 'cancelled' as const
        };
      });

      logs.unshift({
        id: 'log-' + Date.now(),
        timestamp: now,
        actor,
        action: 'cancelled_all',
        note: `Pesanan dibatalkan karena item [${targetItem.sku}] ${targetItem.nama_produk} SOLD OUT. Alasan: ${note}`,
        affected_sku: targetItem.sku,
        affected_item_name: targetItem.nama_produk
      });
    } else if (resolution === 'partial_fulfill') {
      // Tandai item ini dibatalkan/sold_out dan lanjutkan pengiriman sisa item
      newItems = newItems.map(it => {
        if (it.id === itemId) {
          return {
            ...it,
            item_status: 'sold_out' as const,
            sold_note: note,
            sold_at: now,
            sold_by: actor
          };
        }
        return it;
      });

      // Cek apakah masih ada item ready
      const readyItems = newItems.filter(it => it.item_status !== 'sold_out' && it.item_status !== 'cancelled');
      if (readyItems.length === 0) {
        updatedStatus = 'batal';
      }

      logs.unshift({
        id: 'log-' + Date.now(),
        timestamp: now,
        actor,
        action: 'partial_fulfill',
        note: `Item [${targetItem.sku}] ${targetItem.nama_produk} ditandai SOLD OUT & dikeluarkan dari paket. Alasan: ${note}. Melanjutkan sisa ${readyItems.length} produk ready.`,
        affected_sku: targetItem.sku,
        affected_item_name: targetItem.nama_produk
      });
    } else {
      // Hanya menandai item sold_out tanpa langsung mengubah status order (misal menunggu konfirmasi store)
      newItems = newItems.map(it => {
        if (it.id === itemId) {
          return {
            ...it,
            item_status: 'sold_out' as const,
            sold_note: note,
            sold_at: now,
            sold_by: actor
          };
        }
        return it;
      });

      logs.unshift({
        id: 'log-' + Date.now(),
        timestamp: now,
        actor,
        action: 'marked_sold',
        note: `Item [${targetItem.sku}] ${targetItem.nama_produk} ditandai SOLD OUT di DealPOS Marketplace. Menunggu konfirmasi Store. Catatan: ${note}`,
        affected_sku: targetItem.sku,
        affected_item_name: targetItem.nama_produk
      });
    }

    const updatedOrder: ManualShipmentOrder = {
      ...order,
      items: newItems,
      status: updatedStatus,
      history_logs: logs
    };

    const res = await editManualShipment(updatedOrder);
    if (res.success) {
      return { success: true, message: 'Status item dan histori berhasil diperbarui', updatedOrder };
    }
    return { success: false, message: res.message || 'Gagal menyimpan perubahan' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Terjadi kesalahan sistem' };
  }
}

export async function restoreSoldItem(
  orderId: string,
  itemId: string,
  actor: string
): Promise<{ success: boolean; message: string; updatedOrder?: ManualShipmentOrder }> {
  try {
    const orders = await fetchManualShipments();
    const order = orders.find(o => o.id === orderId || o.no_pesanan === orderId);
    if (!order) return { success: false, message: 'Pesanan tidak ditemukan' };

    const targetItem = (order.items || []).find(it => it.id === itemId);
    if (!targetItem) return { success: false, message: 'Item tidak ditemukan' };

    const now = new Date().toISOString();
    const logs: ManualShipmentHistoryLog[] = order.history_logs || [];

    const newItems = (order.items || []).map(it => {
      if (it.id === itemId) {
        const { item_status, sold_note, sold_at, sold_by, ...rest } = it;
        return {
          ...rest,
          item_status: 'ready' as const
        };
      }
      return it;
    });

    let newStatus = order.status;
    if (newStatus === 'batal') {
      newStatus = 'diproses';
    }

    logs.unshift({
      id: 'log-' + Date.now(),
      timestamp: now,
      actor,
      action: 'edited',
      note: `Status sold out item [${targetItem.sku}] ${targetItem.nama_produk} dipulihkan menjadi Ready.`,
      affected_sku: targetItem.sku,
      affected_item_name: targetItem.nama_produk
    });

    const updatedOrder: ManualShipmentOrder = {
      ...order,
      items: newItems,
      status: newStatus,
      history_logs: logs
    };

    const res = await editManualShipment(updatedOrder);
    return { success: res.success, message: res.message, updatedOrder };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal memulihkan status item' };
  }
}
