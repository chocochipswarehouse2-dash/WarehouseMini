/**
 * Utility functions for Alteration & Repair detection & validation
 */

export function isRealAlterItem(it: any): boolean {
  if (!it) return false;

  // 1. If needs_alteration is explicitly false/0/tidak/no, then user did NOT opt for alteration
  if (
    it.needs_alteration === false ||
    it.needs_alteration === 'false' ||
    it.needs_alteration === 0 ||
    it.needs_alteration === '0' ||
    it.needs_alteration === 'tidak' ||
    it.needs_alteration === 'no'
  ) {
    return false;
  }

  // 2. Check boolean or string needs_alteration for true value
  if (
    it.needs_alteration === true ||
    it.needs_alteration === 'true' ||
    it.needs_alteration === 1 ||
    it.needs_alteration === '1' ||
    it.needs_alteration === 'ya' ||
    it.needs_alteration === 'yes'
  ) {
    return true;
  }

  // 3. If needs_alteration is null/undefined, check for explicit form ID or detailed instructions
  const cleanFormId = String(it.id_form_alter || '').trim();
  const hasFormId =
    cleanFormId.length > 0 &&
    cleanFormId !== '-' &&
    cleanFormId.toLowerCase() !== 'none' &&
    cleanFormId.toLowerCase() !== 'null' &&
    cleanFormId.toLowerCase() !== 'undefined' &&
    cleanFormId.toLowerCase() !== 'auto';

  // 4. Check alteration_detail for non-default, specific text
  const cleanDetail = String(it.alteration_detail || '').trim().toLowerCase();
  const hasDetail =
    cleanDetail.length > 0 &&
    cleanDetail !== '-' &&
    cleanDetail !== 'none' &&
    cleanDetail !== 'null' &&
    cleanDetail !== 'undefined' &&
    cleanDetail !== 'tanpa alterasi' &&
    cleanDetail !== 'tidak ada' &&
    cleanDetail !== 'sesuai instruksi store' &&
    cleanDetail !== 'sesuai catatan';

  return hasFormId || hasDetail;
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

