/**
 * Utility functions for Alteration & Repair detection & validation
 */

export function isRealAlterItem(it: any): boolean {
  if (!it) return false;

  // 1. Check boolean or string needs_alteration
  let needsAlt = false;
  if (typeof it.needs_alteration === 'boolean') {
    needsAlt = it.needs_alteration;
  } else if (typeof it.needs_alteration === 'string') {
    const s = it.needs_alteration.trim().toLowerCase();
    needsAlt = s === 'true' || s === '1' || s === 'ya' || s === 'yes';
  } else if (typeof it.needs_alteration === 'number') {
    needsAlt = it.needs_alteration === 1;
  }

  // 2. Check id_form_alter
  const cleanFormId = String(it.id_form_alter || '').trim();
  const hasFormId =
    cleanFormId.length > 0 &&
    cleanFormId !== '-' &&
    cleanFormId.toLowerCase() !== 'none' &&
    cleanFormId.toLowerCase() !== 'null' &&
    cleanFormId.toLowerCase() !== 'undefined';

  // 3. Check layanan_alter
  const cleanLayanan = String(it.layanan_alter || '').trim();
  const hasLayanan =
    cleanLayanan.length > 0 &&
    cleanLayanan !== '-' &&
    cleanLayanan.toLowerCase() !== 'none' &&
    cleanLayanan.toLowerCase() !== 'null' &&
    cleanLayanan.toLowerCase() !== 'undefined';

  // 4. Check alteration_detail
  const cleanDetail = String(it.alteration_detail || '').trim();
  const hasDetail =
    cleanDetail.length > 0 &&
    cleanDetail !== '-' &&
    cleanDetail.toLowerCase() !== 'none' &&
    cleanDetail.toLowerCase() !== 'null' &&
    cleanDetail.toLowerCase() !== 'undefined';

  return needsAlt || hasFormId || hasLayanan || hasDetail;
}

export function hasRealAlterItems(order: any): boolean {
  if (!order) return false;
  const isAr =
    order.order_type === 'alteration_repair' ||
    (order.no_pesanan || '').toUpperCase().startsWith('AR-') ||
    !!order.alteration_repair_data;
  if (isAr) return true;
  return Array.isArray(order.items) && order.items.some(isRealAlterItem);
}

export function getRealAlterItems(order: any): any[] {
  if (!order || !Array.isArray(order.items)) return [];
  const isAr =
    order.order_type === 'alteration_repair' ||
    (order.no_pesanan || '').toUpperCase().startsWith('AR-') ||
    !!order.alteration_repair_data;
  if (isAr) return order.items;
  return order.items.filter(isRealAlterItem);
}

/**
 * Utility functions for Store Drop & Courier Shipment logic
 */
export function isKirimKeStoreOrder(order: any): boolean {
  if (!order) return false;
  if (order.tujuan_pengiriman === 'store' || order.delivery_method === 'drop_store') return true;
  if (order.alteration_repair_data?.tujuan_pengembalian === 'store') return true;

  const tujuan = String(order.nama_tujuan || '').toLowerCase();
  const alamat = String(order.alamat_tujuan || '').toLowerCase();
  const jasa = String(order.jasa_kirim || '').toLowerCase();

  if (tujuan.includes('store') || tujuan.startsWith('toko')) return true;
  if (alamat.includes('store') || alamat.includes('toko chocochips') || alamat.includes('[drop off store]')) return true;
  if (
    jasa.includes('internal') ||
    jasa.includes('ambil di store') ||
    jasa.includes('pickup store') ||
    jasa.includes('drop ke store') ||
    jasa.includes('handover store')
  ) {
    return true;
  }

  return false;
}

export function isExternalCourier(jasaKirim?: string): boolean {
  if (!jasaKirim) return false;
  const j = jasaKirim.toLowerCase().trim();
  if (!j || j === '-' || j === '--') return false;
  if (
    j.includes('drop ke store') ||
    j.includes('internal') ||
    j.includes('ambil di store') ||
    j.includes('pickup store') ||
    j.includes('handover store') ||
    j === 'drop_store'
  ) {
    return false;
  }
  return true;
}

export function orderNeedsResi(order: any): boolean {
  if (!order || order.status === 'batal') return false;
  const isStoreDrop = isKirimKeStoreOrder(order);
  const isCourier = isExternalCourier(order.jasa_kirim);

  if (isStoreDrop && !isCourier) {
    // Drop di toko tanpa jasa kirim eksternal -> TIDAK PERLU UPDATE RESI
    return false;
  }
  return true;
}

