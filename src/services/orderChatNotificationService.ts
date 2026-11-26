/**
 * Centralized WMS Live Chat Notification Dispatcher for Manual Shipment & Alteration Orders.
 *
 * Strictly enforces:
 * - 1 Store = 1 Permanent Group (`group_ops_<storeCode>` with ONLY @warehouse, @chocoadm, @choco<store>).
 * - Inter-Store Isolation: Supplier Store B NEVER enters Requester Store A's group;
 *   notifications are dispatched to Store B's own group and progress updates are mirrored back to Store A's group.
 * - Zero WA Fonnte dependency for Store/Admin WH coordination (Picking WA Grup remains Marketplace-only in ManualShipmentTab).
 */

import { ManualShipmentOrder, ManualShipmentItem, ProductItem, UserSession } from '../types';
import {
  liveChatManager,
  ChatContextTag,
  ChatOrderContext,
} from './liveChatService';
import {
  DEFAULT_OUTLETS,
  editManualShipment,
  fetchManualShipmentByOrderId,
  getAllStoreContacts,
  getFullStoreName,
  isSameStore,
  resolveOrderFulfillmentStores,
} from './gasManualShipment';
import { supabaseFetch } from './supabase';
import { isStoreAccountSession } from './permissions';
import { isRealAlterItem, hasRealAlterItems, hasValidArData } from '../utils/alterationUtils';
import { lookupProductBySku } from '../utils/productLookup';
import { getUserPersonName } from '../utils/userResolver';

/**
 * Menghapus blok metadata internal yang disisipkan di kolom notes_paket database
 * ([ALTERATION_REPAIR]:{...}, [HISTORI_LOGS]:[...], [STORE_METADATA]:{...}, [RETUR_BARANG]:{...})
 * agar tidak pernah bocor sebagai teks JSON mentah di Live Chat maupun preview pesan.
 */
export function stripInternalOrderMetadata(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .replace(
      /\r?\n?\[(?:ALTERATION_REPAIR|HISTORI_LOGS|STORE_METADATA|RETUR_BARANG)\]:\s*(?:\{[^\r\n]*\}|\[[^\r\n]*\])/g,
      ''
    )
    .replace(
      /\r?\n?\[(?:ALTERATION_REPAIR|HISTORI_LOGS|STORE_METADATA|RETUR_BARANG)\]:[\s\S]*?(?=\r?\n\[(?:ALTERATION_REPAIR|HISTORI_LOGS|STORE_METADATA|RETUR_BARANG)\]:|$)/g,
      ''
    )
    .replace(/(📝\s*Catatan(?:\s+Paket)?:\s*)$/i, '$1-')
    .trim();
}

function getOrderId(order: ManualShipmentOrder): string {
  return String(order.no_pesanan || order.no_transaksi_customer || (order as any).id || '-').trim();
}

function getRequesterStoreName(order: ManualShipmentOrder): string {
  const raw =
    order.nama_pengirim ||
    order.alteration_repair_data?.nama_asal ||
    '';
  return getFullStoreName(raw) || raw.trim();
}

function formatDealposStr(order: ManualShipmentOrder): string {
  if (Array.isArray(order.no_transaksi_pengirim)) {
    return order.no_transaksi_pengirim.filter(Boolean).join(', ') || '-';
  }
  return String(order.no_transaksi_pengirim || '-').trim() || '-';
}

function isGudangFulfillment(ful?: string): boolean {
  const f = String(ful || '').trim().toLowerCase();
  return !f || f.includes('marketplace') || f.includes('gudang') || f.includes('warehouse');
}

function buildOrderContext(
  order: ManualShipmentOrder,
  statusOverride?: string,
  resiOverride?: string
): ChatOrderContext {
  const items = Array.isArray(order.items) ? order.items : [];
  const totalPcs = items.reduce((s, it) => s + (Number(it.qty) || 1), 0);
  const firstItem = items[0];
  const itemsSummary =
    items.length === 0
      ? '-'
      : items.length === 1
      ? `${firstItem.nama_produk || firstItem.sku || 'Produk'} (${firstItem.qty || 1} pcs)`
      : `${firstItem.nama_produk || firstItem.sku || 'Produk'} (+${items.length - 1} item lainnya)`;

  return {
    order_id: getOrderId(order),
    store_name: getRequesterStoreName(order) || undefined,
    customer_name: order.nama_tujuan || undefined,
    items_summary: itemsSummary,
    total_pcs: totalPcs,
    status: statusOverride || order.status || 'diterima',
    no_resi: resiOverride !== undefined ? resiOverride || undefined : order.no_resi || undefined,
  };
}

function buildOrderTags(
  order: ManualShipmentOrder,
  extraTags: ChatContextTag[] = []
): ChatContextTag[] {
  const tags: ChatContextTag[] = [];
  const orderId = getOrderId(order);
  if (orderId && orderId !== '-') {
    tags.push({ type: 'ORDER', code: orderId });
  }
  for (const t of extraTags) {
    if (t.code && !tags.some((x) => x.type === t.type && x.code === t.code)) {
      tags.push(t);
    }
  }
  const skus = Array.from(
    new Set(
      (order.items || [])
        .map((it) => String(it.sku || '').trim())
        .filter((s) => s && s !== '-')
    )
  ).slice(0, 3);
  for (const sku of skus) {
    if (!tags.some((x) => x.type === 'SKU' && x.code === sku)) {
      tags.push({ type: 'SKU', code: sku });
    }
  }
  return tags;
}

function formatAlterWorkOrderText(order: ManualShipmentOrder): string {
  const alterItems = (order.items || []).filter(isRealAlterItem);
  const itemsToRender = alterItems.length > 0 ? alterItems : order.items || [];
  if (itemsToRender.length === 0) return '';

  const orderId = getOrderId(order);
  const dealposStr = formatDealposStr(order);
  const ar = order.alteration_repair_data;
  const globalPhotos = Array.isArray(ar?.foto_urls) ? ar!.foto_urls.filter((u) => u && !u.startsWith('data:')) : [];

  const itemsList = itemsToRender
    .map((it, idx) => {
      const alterId = it.id_form_alter || ar?.id_form_alter || 'ALT-AUTO';
      const itemPhotos = Array.isArray(it.foto_urls)
        ? it.foto_urls.filter((u) => u && !u.startsWith('data:'))
        : [];
      const photoText =
        itemPhotos.length > 0
          ? `\n   • Foto Panduan:\n` + itemPhotos.map((u, i) => `     ${i + 1}. ${u}`).join('\n')
          : '';
      const layanan = it.layanan_type || ar?.layanan_type || 'Alteration';
      const instr = it.alteration_detail || it.repair_detail || 'Sesuai instruksi store';

      return (
        `${idx + 1}. [ID ALTER: ${alterId}]\n` +
        `   • Produk: ${it.nama_produk} (SKU: ${it.sku || '-'}, Size: ${it.size || '-'})\n` +
        `   • Qty: ${it.qty || 1} pcs | Fulfillment: ${it.fulfillment || ar?.nama_asal || 'Store'}\n` +
        `   • Layanan: ${layanan}\n` +
        `   • Instruksi Penjahit: ${instr}${photoText}`
      );
    })
    .join('\n\n');

  const globalPhotoText =
    globalPhotos.length > 0
      ? `\n📸 Foto Panduan (Google Drive):\n` + globalPhotos.map((u, i) => `  ${i + 1}. ${u}`).join('\n')
      : '';

  return (
    `✂️ SURAT PERINTAH KERJA (SPK) ALTERASI / REPAIR\n` +
    `────────────────────────────────────\n` +
    `• Order ID / Tiket: #${orderId}\n` +
    `• ID Form Alter: ${ar?.id_form_alter || itemsToRender[0]?.id_form_alter || '-'}\n` +
    `• Store Pengirim: ${getRequesterStoreName(order) || '-'} (PIC: ${order.pic_store || ar?.pic_pemohon || '-'})\n` +
    `• Sumber Fisik: ${ar?.sumber_barang === 'warehouse' ? 'Stok Gudang (Warehouse)' : `Fisik dari Store (${getRequesterStoreName(order) || '-'})`}\n` +
    `• No. DealPOS: ${dealposStr}\n` +
    `• Penerima Akhir: ${
      ar?.tujuan_pengembalian === 'customer'
        ? `Customer (${order.nama_tujuan || ar?.nama_penerima_kembali || '-'})`
        : order.nama_tujuan || `Store (${getRequesterStoreName(order) || '-'})`
    }\n` +
    `• Jasa Kirim: ${order.jasa_kirim || '-'}\n` +
    `${ar?.perkiraan_selesai ? `• Target Selesai: ${ar.perkiraan_selesai}\n` : ''}` +
    `\n✂️ Rincian Item (${itemsToRender.length} Item):\n` +
    `${itemsList}${globalPhotoText}\n\n` +
    `📝 Catatan: ${stripInternalOrderMetadata(order.notes_paket) || '-'}`
  );
}

function formatInterStoreRequestText(
  order: ManualShipmentOrder,
  supplierStoreName: string,
  requesterStoreName: string,
  supplierItems: ManualShipmentItem[]
): string {
  const orderId = getOrderId(order);
  const itemsText = supplierItems
    .map((it, idx) => {
      const sizeStr = it.size && it.size !== 'ALL' && it.size !== '-' ? ` (Size: ${it.size})` : '';
      const alterText = isRealAlterItem(it)
        ? `\n     ✂️ Instruksi Alter: ${it.alteration_detail || it.layanan_type || 'Perlu Alterasi'}`
        : '';
      return `  ${idx + 1}. [${it.sku || '-'}] ${it.nama_produk}${sizeStr} — ${it.qty || 1} pcs${alterText}`;
    })
    .join('\n');

  return (
    `📦 PERMINTAAN PENGIRIMAN PRODUK (STORE ➔ WAREHOUSE)\n` +
    `────────────────────────────────────\n` +
    `Halo Tim ${supplierStoreName}, terdapat pesanan penarikan barang yang diajukan oleh ${requesterStoreName} untuk dikirimkan ke Gudang Pusat Chocochips:\n\n` +
    `• Order ID: #${orderId}\n` +
    `• Store Pemohon: ${requesterStoreName} (PIC: ${order.pic_store || '-'})\n` +
    `• Store Penyedia Barang: ${supplierStoreName}\n` +
    `• Customer Tujuan Akhir: ${order.nama_tujuan || '-'}\n\n` +
    `👕 Daftar Produk dari Store ${supplierStoreName} (${supplierItems.length} item):\n` +
    `${itemsText || '  1. Produk Pakaian Pesanan'}\n\n` +
    `🚚 Tujuan Pengiriman: WAREHOUSE CHOCOCHIPS (Gudang Pusat)\n` +
    `📄 Dokumen Wajib: Cetak Surat Jalan Kirim (Struk Rangkap 2) di menu Pesanan Saya — Lembar 1 untuk arsip toko, Lembar 2 lampirkan pada fisik paket.`
  );
}

/**
 * 1. Submit Pesanan Baru / Edit Pesanan (Manual Shipment & Alteration & Repair)
 */
export async function notifyOrderSubmittedToChat(
  order: ManualShipmentOrder,
  options?: {
    isEdit?: boolean;
    diffChanges?: string[];
    formattedEditMessage?: string;
    actorName?: string;
  }
): Promise<{ requesterSent: boolean; interStoreSentCount: number }> {
  let requesterSent = false;
  let interStoreSentCount = 0;

  try {
    const requesterStore = getRequesterStoreName(order);
    const orderId = getOrderId(order);
    const isAlterOrder = hasRealAlterItems(order) || order.order_type === 'alteration_repair';
    const actor = options?.actorName || order.pic_store || order.alteration_repair_data?.pic_pemohon || 'Tim Store';

    if (requesterStore) {
      let msgText = '';
      let eventType = 'order_submit';

      if (options?.isEdit) {
        eventType = 'order_edit';
        if (options.formattedEditMessage) {
          msgText = options.formattedEditMessage;
        } else {
          const changesList = (options.diffChanges || []).map((c) => `• ${c}`).join('\n');
          msgText =
            `✏️ PEMBARUAN DATA PESANAN #${orderId}\n` +
            `────────────────────────────────────\n` +
            `• Store Pengirim: ${requesterStore} (PIC: ${order.pic_store || '-'})\n` +
            `• Diperbarui Oleh: ${actor}\n\n` +
            `🔄 Poin Perubahan:\n${changesList || '• Data pesanan diperbarui'}\n\n` +
            `📦 Total Produk Akhir: ${(order.items || []).reduce((s, it) => s + (Number(it.qty) || 1), 0)} pcs | Kurir: ${order.jasa_kirim || '-'}`;
        }
      } else if (isAlterOrder) {
        msgText = formatAlterWorkOrderText(order);
      } else {
        const items = Array.isArray(order.items) ? order.items : [];
        const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
        const itemsListStr = items
          .map(
            (it, idx) =>
              `  ${idx + 1}. [${it.sku || '-'}] ${it.nama_produk} (Qty: ${it.qty || 1} pcs, Fulfillment: ${it.fulfillment || '-'})` +
              (it.needs_alteration
                ? `\n     ✂️ [Alteration: ${it.id_form_alter || 'Auto'}] ${it.alteration_detail || '-'}`
                : '')
          )
          .join('\n');

        msgText =
          `📦 KONFIRMASI PESANAN MANUAL SHIPMENT BARU\n` +
          `────────────────────────────────────\n` +
          `• Order ID: #${orderId}\n` +
          `• Store Pengirim: ${requesterStore} (PIC: ${order.pic_store || '-'})\n` +
          `• No. DealPOS: ${formatDealposStr(order)}\n` +
          `• Customer: ${order.nama_tujuan || '-'} (${order.no_telp_tujuan || '-'})\n` +
          `• Alamat: ${order.alamat_tujuan || '-'}\n` +
          `• Jasa Kirim: ${order.jasa_kirim || '-'}\n\n` +
          `📋 Daftar Produk (${totalQty} pcs):\n${itemsListStr}\n\n` +
          `📝 Catatan Paket: ${stripInternalOrderMetadata(order.notes_paket) || '-'}`;
      }

      if (msgText) {
        const res = await liveChatManager.sendSystemGroupMessage({
          storeName: requesterStore,
          text: msgText,
          contextTags: buildOrderTags(order),
          orderContext: buildOrderContext(order),
          eventType,
          actorName: actor,
        });
        requesterSent = res.success;
      }
    }

    // Inter-Store Fulfillment: isolate each supplier store in its own Store Ops group
    const fulfillmentData = resolveOrderFulfillmentStores(order);
    for (const group of fulfillmentData.groups) {
      if (!group.isInterStore || group.isGudangGroup) continue;

      const interStoreText = options?.isEdit
        ? `✏️ UPDATE PESANAN ANTAR-STORE #${orderId}\n` +
          `────────────────────────────────────\n` +
          `Pesanan oleh ${fulfillmentData.requesterStoreName} telah diperbarui oleh ${actor}.\n\n` +
          `👕 Item yang masih dialokasikan dari Store ${group.storeName}:\n` +
          group.items
            .map((it, idx) => `  ${idx + 1}. [${it.sku || '-'}] ${it.nama_produk} — ${it.qty || 1} pcs`)
            .join('\n')
        : formatInterStoreRequestText(
            order,
            group.storeName,
            fulfillmentData.requesterStoreName,
            group.items
          );

      const interRes = await liveChatManager.sendSystemGroupMessage({
        storeName: group.storeName,
        text: interStoreText,
        contextTags: buildOrderTags({ ...order, items: group.items }),
        orderContext: buildOrderContext(order),
        eventType: options?.isEdit ? 'order_edit' : 'interstore_request',
        actorName: actor,
      });
      if (interRes.success) interStoreSentCount++;
    }
  } catch (err) {
    console.warn('[OrderChatNotify] notifyOrderSubmittedToChat error:', err);
  }

  return { requesterSent, interStoreSentCount };
}

/**
 * 2. Resend / Kirim Manual SPK Alterasi ke Grup Live Chat Store
 */
export async function notifyAlterSpkToChat(
  order: ManualShipmentOrder,
  actorName?: string
): Promise<boolean> {
  try {
    const storeName = getRequesterStoreName(order);
    if (!storeName) return false;
    const msgText = formatAlterWorkOrderText(order);
    if (!msgText) return false;

    const res = await liveChatManager.sendSystemGroupMessage({
      storeName,
      text: msgText,
      contextTags: buildOrderTags(order),
      orderContext: buildOrderContext(order),
      eventType: 'alter_progress',
      actorName: actorName || order.pic_store || 'Tim WMS',
    });
    return res.success;
  } catch (err) {
    console.warn('[OrderChatNotify] notifyAlterSpkToChat error:', err);
    return false;
  }
}

/**
 * 3. Input / Update Resi Satuan
 */
export async function notifyOrderResiUpdatedToChat(
  order: ManualShipmentOrder,
  newResi: string,
  actorName?: string
): Promise<boolean> {
  try {
    const storeName = getRequesterStoreName(order);
    if (!storeName || !newResi.trim()) return false;
    const orderId = getOrderId(order);

    const text =
      `🚚 UPDATE RESI PENGIRIMAN #${orderId}\n` +
      `────────────────────────────────────\n` +
      `Nomor resi pengiriman pesanan Store ${storeName} telah diperbarui & status otomatis berubah menjadi DIKIRIM:\n\n` +
      `• Order ID: #${orderId}\n` +
      `• Store Pengirim: ${storeName} (PIC: ${order.pic_store || '-'})\n` +
      `• Jasa Kirim: ${order.jasa_kirim || '-'}\n` +
      `• Customer: ${order.nama_tujuan || '-'}\n` +
      `• No. Resi Baru: ${newResi.trim()}\n\n` +
      `Silakan simpan dan teruskan nomor resi ini kepada customer.`;

    const res = await liveChatManager.sendSystemGroupMessage({
      storeName,
      text,
      contextTags: buildOrderTags(order),
      orderContext: buildOrderContext(order, 'Dikirim', newResi.trim()),
      eventType: 'resi_update',
      actorName: actorName || 'Admin Gudang',
    });
    return res.success;
  } catch (err) {
    console.warn('[OrderChatNotify] notifyOrderResiUpdatedToChat error:', err);
    return false;
  }
}

/**
 * 4. Bulk Update Resi (Tabel / CSV) — Grouped 1 consolidated message per Store
 */
export async function notifyBulkResiUpdatedToChat(
  entries: Array<{ order: ManualShipmentOrder; newResi: string }>,
  actorName?: string
): Promise<number> {
  let groupsSent = 0;
  try {
    const valid = entries.filter((e) => e.order && e.newResi && e.newResi.trim());
    if (valid.length === 0) return 0;

    const byStore = new Map<string, Array<{ order: ManualShipmentOrder; newResi: string }>>();
    for (const entry of valid) {
      const storeName = getRequesterStoreName(entry.order);
      if (!storeName) continue;
      if (!byStore.has(storeName)) byStore.set(storeName, []);
      byStore.get(storeName)!.push(entry);
    }

    for (const [storeName, storeEntries] of byStore.entries()) {
      const lines = storeEntries
        .map(
          (e, idx) =>
            `${idx + 1}. #${getOrderId(e.order)} — ${e.order.nama_tujuan || '-'} (${e.order.jasa_kirim || '-'})\n   📦 Resi: ${e.newResi.trim()}`
        )
        .join('\n');

      const text =
        `🚚 UPDATE RESI MASSAL (${storeEntries.length} PESANAN)\n` +
        `────────────────────────────────────\n` +
        `Halo Tim ${storeName}, berikut pembaruan nomor resi pengiriman oleh ${actorName || 'Admin Gudang'}:\n\n` +
        `${lines}\n\n` +
        `Seluruh pesanan di atas telah berstatus DIKIRIM.`;

      const tags: ChatContextTag[] = storeEntries
        .slice(0, 5)
        .map((e) => ({ type: 'ORDER' as const, code: getOrderId(e.order) }));

      const res = await liveChatManager.sendSystemGroupMessage({
        storeName,
        text,
        contextTags: tags,
        orderContext:
          storeEntries.length === 1
            ? buildOrderContext(storeEntries[0].order, 'Dikirim', storeEntries[0].newResi.trim())
            : undefined,
        eventType: 'resi_update',
        actorName: actorName || 'Admin Gudang',
      });
      if (res.success) groupsSent++;
    }
  } catch (err) {
    console.warn('[OrderChatNotify] notifyBulkResiUpdatedToChat error:', err);
  }
  return groupsSent;
}

/**
 * 5. Pembatalan Pesanan — Notif ke Store Pemohon + Store Penyedia (jika barang belum diterima di WH)
 */
export async function notifyOrderCancelledToChat(
  order: ManualShipmentOrder,
  reasonText: string,
  actorName?: string
): Promise<void> {
  try {
    const requesterStore = getRequesterStoreName(order);
    const orderId = getOrderId(order);
    const actor = actorName || 'Admin Gudang';

    if (requesterStore) {
      const text =
        `🚫 PEMBATALAN PESANAN #${orderId}\n` +
        `────────────────────────────────────\n` +
        `• Store Pengirim: ${requesterStore} (PIC: ${order.pic_store || '-'})\n` +
        `• Customer: ${order.nama_tujuan || '-'}\n` +
        `• Total Produk: ${(order.items || []).length} item\n` +
        `• Alasan Pembatalan: ${reasonText}\n` +
        `• Dibatalkan Oleh: ${actor}\n\n` +
        `Histori pesanan tetap tersimpan permanen untuk pelacakan & audit.`;

      await liveChatManager.sendSystemGroupMessage({
        storeName: requesterStore,
        text,
        contextTags: buildOrderTags(order),
        orderContext: buildOrderContext(order, 'Batal'),
        eventType: 'order_cancel',
        actorName: actor,
      });
    }

    // Notify any unreceived inter-store supplier group separately so they stop shipping physical stock
    const fulfillmentData = resolveOrderFulfillmentStores(order);
    for (const group of fulfillmentData.groups) {
      if (!group.isInterStore || group.isGudangGroup) continue;
      const hasUnreceived = group.items.some((it) => !it.received_at_warehouse);
      if (!hasUnreceived) continue;

      const itemsStr = group.items
        .map((it, idx) => `  ${idx + 1}. [${it.sku || '-'}] ${it.nama_produk} (${it.qty || 1} pcs)`)
        .join('\n');

      const supplierText =
        `🚫 PESANAN PENARIKAN BARANG DIBATALKAN #${orderId}\n` +
        `────────────────────────────────────\n` +
        `Halo Tim ${group.storeName}, pesanan dari ${fulfillmentData.requesterStoreName} telah DIBATALKAN oleh ${actor}.\n\n` +
        `• Alasan: ${reasonText}\n` +
        `• Item dari Store ${group.storeName} yang tidak perlu dikirim:\n${itemsStr}`;

      await liveChatManager.sendSystemGroupMessage({
        storeName: group.storeName,
        text: supplierText,
        contextTags: buildOrderTags({ ...order, items: group.items }),
        orderContext: buildOrderContext(order, 'Batal'),
        eventType: 'order_cancel',
        actorName: actor,
      });
    }
  } catch (err) {
    console.warn('[OrderChatNotify] notifyOrderCancelledToChat error:', err);
  }
}

/**
 * 6. Input / Update No. SJ Delivery DealPOS (Marketplace -> Store)
 */
export async function notifySjMarketplaceUpdatedToChat(
  order: ManualShipmentOrder,
  cleanSj: string,
  targetLabel: string,
  actorName?: string
): Promise<boolean> {
  try {
    const storeName = getRequesterStoreName(order);
    if (!storeName) return false;
    const orderId = getOrderId(order);

    const text = cleanSj
      ? `📄 UPDATE NO. SJ DELIVERY DEALPOS (MKT ➔ STORE)\n` +
        `────────────────────────────────────\n` +
        `• Order ID: #${orderId}\n` +
        `• Store: ${storeName}\n` +
        `• No. SJ Delivery DealPOS: ${cleanSj}\n` +
        `• Cakupan Item: ${targetLabel}\n` +
        `• Diinput Oleh: ${actorName || 'Admin Gudang'}`
      : `📄 PENGHAPUSAN NO. SJ DEALPOS #${orderId}\n` +
        `• Cakupan Item: ${targetLabel}\n` +
        `• Oleh: ${actorName || 'Admin Gudang'}`;

    const extraTags: ChatContextTag[] = cleanSj ? [{ type: 'SJ', code: cleanSj, label: 'DealPOS' }] : [];
    const res = await liveChatManager.sendSystemGroupMessage({
      storeName,
      text,
      contextTags: buildOrderTags(order, extraTags),
      orderContext: buildOrderContext(order),
      eventType: 'sj_marketplace',
      actorName: actorName || 'Admin Gudang',
    });
    return res.success;
  } catch (err) {
    console.warn('[OrderChatNotify] notifySjMarketplaceUpdatedToChat error:', err);
    return false;
  }
}

/**
 * 6b. Update No. SJ Delivery DealPOS Massal — Dikelompokkan per Store agar rapi & tidak spam
 */
export async function notifyBulkSjMarketplaceUpdatedToChat(
  entries: Array<{ order: ManualShipmentOrder; newSj: string }>,
  actorName?: string
): Promise<number> {
  let groupsSent = 0;
  try {
    const valid = entries.filter((e) => e.order && e.newSj && e.newSj.trim());
    if (valid.length === 0) return 0;

    const byStore = new Map<string, Array<{ order: ManualShipmentOrder; newSj: string }>>();
    for (const entry of valid) {
      const storeName = getRequesterStoreName(entry.order);
      if (!storeName) continue;
      if (!byStore.has(storeName)) byStore.set(storeName, []);
      byStore.get(storeName)!.push(entry);
    }

    for (const [storeName, storeEntries] of byStore.entries()) {
      const lines = storeEntries
        .map(
          (e, idx) =>
            `${idx + 1}. #${getOrderId(e.order)} — ${e.order.nama_tujuan || '-'}\n   📄 No. SJ DealPOS: ${e.newSj.trim()}`
        )
        .join('\n');

      const text =
        `📄 UPDATE NO. SJ DELIVERY DEALPOS MASSAL (${storeEntries.length} PESANAN)\n` +
        `────────────────────────────────────\n` +
        `Halo Tim ${storeName}, berikut pembaruan No. SJ Delivery DealPOS (MKT ➔ Store) oleh ${actorName || 'Admin Gudang'}:\n\n` +
        `${lines}`;

      const tags: ChatContextTag[] = storeEntries
        .slice(0, 5)
        .map((e) => ({ type: 'ORDER' as const, code: getOrderId(e.order) }));

      const res = await liveChatManager.sendSystemGroupMessage({
        storeName,
        text,
        contextTags: tags,
        orderContext:
          storeEntries.length === 1 ? buildOrderContext(storeEntries[0].order) : undefined,
        eventType: 'sj_marketplace',
        actorName: actorName || 'Admin Gudang',
      });
      if (res.success) groupsSent++;
    }
  } catch (err) {
    console.warn('[OrderChatNotify] notifyBulkSjMarketplaceUpdatedToChat error:', err);
  }
  return groupsSent;
}

/**
 * 7. Gudang Menandai Item Fulfillment Store Diterima (atau Dibatalkan Terima) + Mirroring Inter-Store
 */
export async function notifyWarehouseReceivedStoreItemToChat(
  order: ManualShipmentOrder,
  item: ManualShipmentItem,
  markAsReceived: boolean,
  actorName?: string
): Promise<void> {
  try {
    const supplierRaw =
      item.fulfillment || (item as any).toko_asal || (item as any).store_name || getRequesterStoreName(order);
    const supplierStore = getFullStoreName(supplierRaw) || supplierRaw;
    if (!supplierStore || isGudangFulfillment(supplierStore)) return;

    const requesterStore = getRequesterStoreName(order);
    const orderId = getOrderId(order);
    const actor = actorName || 'Admin Gudang';

    const baseText = markAsReceived
      ? `✅ BARANG DARI STORE SUDAH DITERIMA DI GUDANG PUSAT\n` +
        `────────────────────────────────────\n` +
        `• Order ID: #${orderId}\n` +
        `• Asal Barang (Store): ${supplierStore}\n` +
        `• Produk: [${item.sku || '-'}] ${item.nama_produk} (${item.qty || 1} pcs)\n` +
        `• Diterima Oleh: ${actor}`
      : `↩️ STATUS TERIMA GUDANG DIBATALKAN\n` +
        `────────────────────────────────────\n` +
        `• Order ID: #${orderId}\n` +
        `• Asal Barang: ${supplierStore}\n` +
        `• Produk: [${item.sku || '-'}] ${item.nama_produk}\n` +
        `• Oleh: ${actor}`;

    await liveChatManager.sendSystemGroupMessage({
      storeName: supplierStore,
      text: baseText,
      contextTags: buildOrderTags(order, item.sku ? [{ type: 'SKU', code: item.sku }] : []),
      orderContext: buildOrderContext(order),
      eventType: 'sj_store',
      actorName: actor,
    });

    // Mirror progress to requester Store group if inter-store fulfillment
    if (requesterStore && !isSameStore(supplierStore, requesterStore)) {
      const mirrorText = markAsReceived
        ? `🔄 UPDATE ANTAR-STORE #${orderId}: Produk kiriman dari ${supplierStore} ([${item.sku || '-'}] ${item.nama_produk}) telah DITERIMA fisik di Gudang Pusat oleh ${actor}.`
        : `🔄 UPDATE ANTAR-STORE #${orderId}: Status terima gudang untuk item dari ${supplierStore} ([${item.sku || '-'}]) dibatalkan oleh ${actor}.`;

      await liveChatManager.sendSystemGroupMessage({
        storeName: requesterStore,
        text: mirrorText,
        contextTags: buildOrderTags(order, item.sku ? [{ type: 'SKU', code: item.sku }] : []),
        orderContext: buildOrderContext(order),
        eventType: 'sj_store',
        actorName: actor,
      });
    }
  } catch (err) {
    console.warn('[OrderChatNotify] notifyWarehouseReceivedStoreItemToChat error:', err);
  }
}

/**
 * 8. Barang Sold Out & Pulihkan Barang Sold Out
 */
export async function notifyOrderSoldOutToChat(
  order: ManualShipmentOrder,
  item: ManualShipmentItem,
  resolution: 'mark_only' | 'partial_fulfill' | 'cancel_order',
  cleanNote: string,
  remainingReadyCount: number,
  actorName?: string
): Promise<boolean> {
  try {
    const storeName = getRequesterStoreName(order);
    if (!storeName) return false;
    const orderId = getOrderId(order);

    let resolutionText = '';
    if (resolution === 'cancel_order') {
      resolutionText = '⛔ TINDAKAN GUDANG: Seluruh pesanan ini telah DIBATALKAN.';
    } else if (resolution === 'partial_fulfill') {
      resolutionText = `🚚 TINDAKAN GUDANG: Melanjutkan pengiriman sebagian (Partial Fulfillment) untuk ${remainingReadyCount} produk ready lainnya.`;
    } else {
      resolutionText = '⏳ TINDAKAN GUDANG: Menunggu konfirmasi Store apakah ingin kirim sebagian atau ganti produk lain (balas langsung di chat ini).';
    }

    const text =
      `⚠️ PEMBERITAHUAN BARANG SOLD OUT (MARKETPLACE)\n` +
      `────────────────────────────────────\n` +
      `Halo Tim ${storeName} (PIC: ${order.pic_store || '-'}), ada item yang stoknya KOSONG di DealPOS Marketplace:\n\n` +
      `• Order ID: #${orderId}\n` +
      `• Customer: ${order.nama_tujuan || '-'}\n` +
      `• Produk Kosong: [${item.sku || '-'}] ${item.nama_produk} (${item.qty || 1} pcs${item.size && item.size !== '-' ? `, Size: ${item.size}` : ''})\n` +
      `• Catatan Admin: ${cleanNote}\n\n` +
      `${resolutionText}`;

    const res = await liveChatManager.sendSystemGroupMessage({
      storeName,
      text,
      contextTags: buildOrderTags(order, item.sku ? [{ type: 'SKU', code: item.sku }] : []),
      orderContext: buildOrderContext(order, resolution === 'cancel_order' ? 'Batal' : order.status),
      eventType: 'sold_out',
      actorName: actorName || 'Admin Gudang',
    });
    return res.success;
  } catch (err) {
    console.warn('[OrderChatNotify] notifyOrderSoldOutToChat error:', err);
    return false;
  }
}

export async function notifySoldItemRestoredToChat(
  order: ManualShipmentOrder,
  item: ManualShipmentItem,
  actorName?: string
): Promise<boolean> {
  try {
    const storeName = getRequesterStoreName(order);
    if (!storeName) return false;
    const orderId = getOrderId(order);
    const text =
      `♻️ STATUS ITEM SOLD OUT DIPULIHKAN (READY)\n` +
      `────────────────────────────────────\n` +
      `• Order ID: #${orderId}\n` +
      `• Produk: [${item.sku || '-'}] ${item.nama_produk} (${item.qty || 1} pcs)\n` +
      `• Dipulihkan Oleh: ${actorName || 'Admin Gudang'}`;

    const res = await liveChatManager.sendSystemGroupMessage({
      storeName,
      text,
      contextTags: buildOrderTags(order, item.sku ? [{ type: 'SKU', code: item.sku }] : []),
      orderContext: buildOrderContext(order),
      eventType: 'sold_out',
      actorName: actorName || 'Admin Gudang',
    });
    return res.success;
  } catch (err) {
    console.warn('[OrderChatNotify] notifySoldItemRestoredToChat error:', err);
    return false;
  }
}

/**
 * 9. Alteration & Store Fulfillment 2-Way Actions (AlterationActionModal)
 */
export async function notifyAlterationActionToChat(
  order: ManualShipmentOrder,
  actionType: 'mark_sent_store' | 'mark_received_warehouse' | 'complete_and_ship' | 'mark_dealpos_received',
  details: {
    dispatchingStoreName?: string;
    kurir?: string;
    resi?: string;
    tgl?: string;
    pic?: string;
    kondisi?: string;
    tujuanPengembalian?: 'store' | 'customer';
    namaPenerima?: string;
    noDeliveryDealpos?: string;
    catatan?: string;
    productSummary?: string;
    skuSummary?: string;
    fotoBuktiKirim?: string[];
  },
  actorName?: string
): Promise<void> {
  try {
    const requesterStore = getRequesterStoreName(order);
    const orderId = getOrderId(order);
    const actor = actorName || details.pic || 'Tim WMS';

    if (actionType === 'mark_sent_store') {
      const dispatchStore = getFullStoreName(details.dispatchingStoreName || requesterStore) || requesterStore;
      if (dispatchStore && !isGudangFulfillment(dispatchStore)) {
        const text =
          `🚚 BARANG DIKIRIM DARI STORE KE WAREHOUSE\n` +
          `────────────────────────────────────\n` +
          `• Order ID: #${orderId}\n` +
          `• Store Pengirim Barang: ${dispatchStore}\n` +
          `• Produk: ${details.productSummary || '-'} (${details.skuSummary || '-'})\n` +
          `• Kurir / Ekspedisi: ${details.kurir || '-'}\n` +
          `${details.resi ? `• Resi Kirim Store: ${details.resi}\n` : ''}` +
          `• Tanggal Kirim: ${details.tgl || '-'}\n` +
          `• PIC Pengirim: ${details.pic || actor}`;

        await liveChatManager.sendSystemGroupMessage({
          storeName: dispatchStore,
          text,
          contextTags: buildOrderTags(order),
          orderContext: buildOrderContext(order),
          eventType: 'sj_store',
          actorName: actor,
        });

        if (requesterStore && !isSameStore(dispatchStore, requesterStore)) {
          const mirrorText =
            `🔄 UPDATE ANTAR-STORE #${orderId}: Store ${dispatchStore} telah mengirim fisik barang (${details.productSummary || '-'}) menuju Gudang Pusat via ${details.kurir || '-'}${details.resi ? ` (Resi: ${details.resi})` : ''}.`;
          await liveChatManager.sendSystemGroupMessage({
            storeName: requesterStore,
            text: mirrorText,
            contextTags: buildOrderTags(order),
            orderContext: buildOrderContext(order),
            eventType: 'sj_store',
            actorName: actor,
          });
        }
      }
      return;
    }

    if (actionType === 'mark_received_warehouse') {
      if (requesterStore) {
        const text =
          `📦 PAKET DITERIMA DI WAREHOUSE PUSAT\n` +
          `────────────────────────────────────\n` +
          `• Order ID / Tiket: #${orderId}\n` +
          `• Produk: ${details.productSummary || '-'} (${details.skuSummary || '-'})\n` +
          `• Diterima Oleh: ${details.pic || actor} (${details.tgl || '-'})\n` +
          `• Kondisi Fisik: ${details.kondisi || 'Lengkap'}\n\n` +
          `Status: Diterima Warehouse & masuk antrean proses.`;

        await liveChatManager.sendSystemGroupMessage({
          storeName: requesterStore,
          text,
          contextTags: buildOrderTags(order),
          orderContext: buildOrderContext(order, 'Diterima Warehouse'),
          eventType: 'alter_progress',
          actorName: actor,
        });
      }

      // Mirror receipt to any inter-store supplier stores
      const fulfillmentData = resolveOrderFulfillmentStores(order);
      for (const grp of fulfillmentData.groups) {
        if (!grp.isInterStore || grp.isGudangGroup) continue;
        await liveChatManager.sendSystemGroupMessage({
          storeName: grp.storeName,
          text: `✅ KIRIMAN ANTAR-STORE #${orderId} TIBA DI WAREHOUSE: Fisik barang dari ${grp.storeName} telah diterima di Gudang Pusat oleh ${details.pic || actor}.`,
          contextTags: buildOrderTags({ ...order, items: grp.items }),
          orderContext: buildOrderContext(order, 'Diterima Warehouse'),
          eventType: 'sj_store',
          actorName: actor,
        });
      }
      return;
    }

    if (actionType === 'complete_and_ship') {
      if (!requesterStore) return;
      const gdrivePhotos = (details.fotoBuktiKirim || []).filter((u) => u && !u.startsWith('data:'));
      const photoLine =
        gdrivePhotos.length > 0
          ? `\n📸 Foto Bukti Kirim:\n` + gdrivePhotos.map((u, i) => `  ${i + 1}. ${u}`).join('\n')
          : '';

      const text =
        `🚚 PESANAN ALTERASI SELESAI & DIKIRIM\n` +
        `────────────────────────────────────\n` +
        `• No. Tiket / Order ID: #${orderId}\n` +
        `• Produk: ${details.productSummary || '-'} (${details.skuSummary || '-'})\n` +
        `• Tujuan: ${details.tujuanPengembalian === 'customer' ? `Customer (${details.namaPenerima || '-'})` : `Store (${details.namaPenerima || requesterStore})`}\n` +
        `• Ekspedisi: ${details.kurir || '-'}\n` +
        `• No. Resi: ${details.resi || '-'}\n` +
        `${details.noDeliveryDealpos ? `• No. Delivery DealPOS: ${details.noDeliveryDealpos}\n` : ''}` +
        `${details.catatan ? `• Catatan: ${details.catatan}\n` : ''}${photoLine}`;

      const extraTags: ChatContextTag[] = details.noDeliveryDealpos
        ? [{ type: 'SJ', code: details.noDeliveryDealpos, label: 'DealPOS' }]
        : [];

      await liveChatManager.sendSystemGroupMessage({
        storeName: requesterStore,
        text,
        contextTags: buildOrderTags(order, extraTags),
        orderContext: buildOrderContext(order, 'Dikirim', details.resi || undefined),
        eventType: 'alter_progress',
        actorName: actor,
      });
      return;
    }

    if (actionType === 'mark_dealpos_received') {
      if (!requesterStore) return;
      const text =
        `✅ KONFIRMASI BARANG DITERIMA DI STORE (DEALPOS RECEIVED)\n` +
        `────────────────────────────────────\n` +
        `• No. Tiket / Order ID: #${orderId}\n` +
        `• Store Penerima: ${requesterStore}\n` +
        `• No. Delivery DealPOS: ${details.noDeliveryDealpos || '-'}\n` +
        `• PIC Penerima: ${details.pic || actor} (${details.tgl || '-'})\n` +
        `${details.catatan ? `• Catatan Kondisi: ${details.catatan}` : ''}`;

      await liveChatManager.sendSystemGroupMessage({
        storeName: requesterStore,
        text,
        contextTags: buildOrderTags(
          order,
          details.noDeliveryDealpos ? [{ type: 'SJ', code: details.noDeliveryDealpos, label: 'DealPOS' }] : []
        ),
        orderContext: buildOrderContext(order, 'Selesai'),
        eventType: 'alter_progress',
        actorName: actor,
      });
    }
  } catch (err) {
    console.warn('[OrderChatNotify] notifyAlterationActionToChat error:', err);
  }
}

/**
 * 10. Jadwal Kirim Store (Drop / Kurir Internal)
 */
export async function notifyStoreScheduleToChat(
  order: ManualShipmentOrder,
  tglJadwal: string,
  catatan: string,
  actorName?: string
): Promise<boolean> {
  try {
    const storeName = getRequesterStoreName(order);
    if (!storeName) return false;
    const orderId = getOrderId(order);

    const text =
      `📅 JADWAL KIRIM KE STORE (STATUS SELESAI)\n` +
      `────────────────────────────────────\n` +
      `• Order ID: #${orderId}\n` +
      `• Store Tujuan: ${storeName}\n` +
      `• Jasa Kirim: ${order.jasa_kirim || 'Kurir Internal / Drop Store'}\n` +
      `• Tanggal Jadwal Kirim: ${tglJadwal}\n` +
      `${catatan ? `• Catatan Pengiriman: ${catatan}\n` : ''}` +
      `• Dijadwalkan Oleh: ${actorName || 'Admin Gudang'}`;

    const res = await liveChatManager.sendSystemGroupMessage({
      storeName,
      text,
      contextTags: buildOrderTags(order),
      orderContext: buildOrderContext(order, 'Selesai'),
      eventType: 'store_schedule',
      actorName: actorName || 'Admin Gudang',
    });
    return res.success;
  } catch (err) {
    console.warn('[OrderChatNotify] notifyStoreScheduleToChat error:', err);
    return false;
  }
}

/**
 * 11. Manual Dispatch Notice ke Store Penyedia (WaStoreNoticeModal & SuratJalanAlterReceiptModal)
 */
export async function notifyStoreFulfillmentGroupManualToChat(
  order: ManualShipmentOrder,
  targetStoreName: string,
  items: ManualShipmentItem[],
  requesterStoreName: string,
  actorName?: string
): Promise<boolean> {
  try {
    if (!targetStoreName || isGudangFulfillment(targetStoreName)) return false;

    const cleanTarget = getFullStoreName(targetStoreName) || targetStoreName;
    const cleanRequester = getFullStoreName(requesterStoreName) || requesterStoreName || getRequesterStoreName(order);
    const isInter = cleanRequester && !isSameStore(cleanTarget, cleanRequester);

    const text = isInter
      ? formatInterStoreRequestText(order, cleanTarget, cleanRequester, items)
      : `📦 PENGINGAT PENGIRIMAN PRODUK (STORE ➔ WAREHOUSE)\n` +
        `────────────────────────────────────\n` +
        `Halo Tim ${cleanTarget}, mohon siapkan dan kirimkan item pesanan berikut ke Gudang Pusat Chocochips:\n\n` +
        `• Order ID: #${getOrderId(order)}\n` +
        `• Customer Tujuan Akhir: ${order.nama_tujuan || '-'}\n\n` +
        `👕 Daftar Item (${items.length} item):\n` +
        items
          .map((it, idx) => `  ${idx + 1}. [${it.sku || '-'}] ${it.nama_produk} (${it.qty || 1} pcs)`)
          .join('\n') +
        `\n\n📄 Jangan lupa cetak Surat Jalan Kirim (Struk Rangkap 2) di WMS.`;

    const res = await liveChatManager.sendSystemGroupMessage({
      storeName: cleanTarget,
      text,
      contextTags: buildOrderTags({ ...order, items }),
      orderContext: buildOrderContext(order),
      eventType: 'interstore_request',
      actorName: actorName || 'Admin Gudang',
    });
    return res.success;
  } catch (err) {
    console.warn('[OrderChatNotify] notifyStoreFulfillmentGroupManualToChat error:', err);
    return false;
  }
}

/**
 * 12. Admin Reminder Ulang ke Store Penyedia (dengan Kartu Interaktif "Konfirmasi Sudah Kirim" di Live Chat)
 */
export async function notifyStoreWarehouseReminderToChat(
  order: ManualShipmentOrder,
  options?: {
    actorName?: string;
    productCatalog?: ProductItem[];
    targetStoreName?: string;
  }
): Promise<{ success: boolean; sentStores: string[]; roomIds: string[]; error?: string }> {
  const sentStores: string[] = [];
  const roomIds: string[] = [];

  try {
    const orderId = getOrderId(order);
    const actor = options?.actorName || 'Admin Gudang';
    const requesterStore = getRequesterStoreName(order);
    const fulfillmentData = resolveOrderFulfillmentStores(order);

    const targetGroups: Array<{ storeName: string; items: ManualShipmentItem[] }> = [];

    for (const grp of fulfillmentData.groups) {
      if (grp.isGudangGroup || isGudangFulfillment(grp.storeName)) continue;
      if (options?.targetStoreName && !isSameStore(grp.storeName, options.targetStoreName)) continue;
      const pendingItems = (grp.items || []).filter(
        (it) =>
          it.item_status !== 'sold_out' &&
          it.item_status !== 'cancelled' &&
          !it.received_at_warehouse
      );
      if (pendingItems.length > 0) {
        targetGroups.push({ storeName: grp.storeName, items: pendingItems });
      }
    }

    // Fallback untuk tiket Alteration/Repair fisik dari Store yang item-nya tidak mengisi kolom fulfillment eksplisit
    if (targetGroups.length === 0) {
      const isArFromStore =
        (order.order_type === 'alteration_repair' ||
          orderId.toUpperCase().startsWith('AR-') ||
          hasRealAlterItems(order)) &&
        order.alteration_repair_data?.sumber_barang !== 'warehouse' &&
        !order.alteration_repair_data?.tgl_terima_warehouse;
      const fallbackStore = options?.targetStoreName || requesterStore;
      if (isArFromStore && fallbackStore && !isGudangFulfillment(fallbackStore)) {
        const activeItems = (order.items || []).filter(
          (it) => it.item_status !== 'sold_out' && it.item_status !== 'cancelled' && !it.received_at_warehouse
        );
        targetGroups.push({
          storeName: getFullStoreName(fallbackStore) || fallbackStore,
          items: activeItems.length > 0 ? activeItems : order.items || [],
        });
      }
    }

    if (targetGroups.length === 0) {
      return {
        success: false,
        sentStores: [],
        roomIds: [],
        error: 'Tidak ada item fulfillment Store yang masih menunggu diterima Gudang pada pesanan ini.',
      };
    }

    const ar = order.alteration_repair_data;
    const alreadySentByStore = Boolean(
      ar?.tgl_kirim_store ||
        ar?.kurir_kirim_store ||
        ['dikirim_store', 'diterima_warehouse', 'dalam_pengerjaan', 'selesai_qc', 'dikirim_kembali', 'selesai'].includes(
          String(ar?.status_flow || '').toLowerCase()
        )
    );
    const cleanNotes = stripInternalOrderMetadata(order.notes_paket);

    for (const grp of targetGroups) {
      const resolvedDetails = grp.items.map((it) => {
        const cleanSku = String(it.sku || '').trim().toUpperCase();
        const master = cleanSku
          ? lookupProductBySku(cleanSku, options?.productCatalog, it.nama_produk, it.size)
          : null;
        const nama_produk =
          master && master.found ? master.nama_produk : it.nama_produk || cleanSku || 'Produk Pesanan';
        const size =
          master && master.found && master.size && master.size !== '-'
            ? master.size
            : it.size && it.size !== '-'
            ? it.size
            : undefined;
        return {
          sku: cleanSku || '-',
          nama_produk,
          size,
          qty: Number(it.qty) || 1,
        };
      });

      const totalPcs = resolvedDetails.reduce((sum, d) => sum + d.qty, 0);
      const itemsText = resolvedDetails
        .map(
          (d, idx) =>
            `  ${idx + 1}. [${d.sku}] ${d.nama_produk}${d.size && d.size !== 'ALL' ? ` (${d.size})` : ''} — ${d.qty} pcs`
        )
        .join('\n');

      const itemsSummary =
        resolvedDetails.length === 1
          ? `${resolvedDetails[0].nama_produk} (${resolvedDetails[0].qty} pcs)`
          : `${resolvedDetails[0].nama_produk} (+${resolvedDetails.length - 1} item lainnya)`;

      const isInterStore = Boolean(requesterStore && !isSameStore(grp.storeName, requesterStore));
      const text =
        `🔔 REMINDER PENGIRIMAN BARANG KE GUDANG PUSAT\n` +
        `────────────────────────────────────\n` +
        `Halo Tim ${grp.storeName}, Admin Gudang (${actor}) belum menerima fisik produk untuk pesanan berikut:\n\n` +
        `• Order ID: #${orderId}\n` +
        `${isInterStore ? `• Store Pemohon: ${requesterStore}\n` : ''}` +
        `• Customer Tujuan: ${order.nama_tujuan || '-'}\n` +
        `• Kurir Akhir: ${order.jasa_kirim || '-'}\n` +
        `• Status Kirim Store: ${alreadySentByStore ? 'Tercatat sudah kirim (belum tiba di WH)' : 'Belum dikonfirmasi kirim'}\n\n` +
        `👕 Produk dari Store ${grp.storeName} (${resolvedDetails.length} item · ${totalPcs} pcs):\n` +
        `${itemsText}\n` +
        `${cleanNotes ? `\n📝 Catatan: ${cleanNotes}\n` : '\n'}` +
        `Mohon segera kirimkan barang ke Gudang Pusat & klik tombol "Konfirmasi Sudah Kirim" pada kartu di atas setelah paket diserahkan ke kurir/ekspedisi.`;

      const orderContext: ChatOrderContext = {
        ...buildOrderContext(order, alreadySentByStore ? 'Menunggu Tiba WH' : 'Menunggu Kirim Store'),
        store_name: grp.storeName,
        items_summary: itemsSummary,
        total_pcs: totalPcs,
        action_type: 'store_kirim_gudang_reminder',
        target_store: grp.storeName,
        items_detail: resolvedDetails,
      };

      const res = await liveChatManager.sendSystemGroupMessage({
        storeName: grp.storeName,
        text,
        contextTags: buildOrderTags({ ...order, items: grp.items }),
        orderContext,
        eventType: 'store_kirim_reminder',
        actorName: actor,
      });

      if (res.success) {
        sentStores.push(grp.storeName);
        if (res.room?.id) roomIds.push(res.room.id);
      }
    }

    if (sentStores.length === 0) {
      return {
        success: false,
        sentStores: [],
        roomIds: [],
        error: 'Gagal mengirim chat reminder ke grup Store terkait.',
      };
    }

    return { success: true, sentStores, roomIds };
  } catch (err: any) {
    console.warn('[OrderChatNotify] notifyStoreWarehouseReminderToChat error:', err);
    return {
      success: false,
      sentStores,
      roomIds,
      error: err?.message || 'Gagal mengirim reminder ke Live Chat Store.',
    };
  }
}

/**
 * 13. Store mengonfirmasi "Sudah Kirim ke Gudang" langsung dari kartu reminder Live Chat
 *     tanpa perlu membuka halaman Pesanan Saya.
 */
export async function confirmStoreSentToWarehouseFromChat(params: {
  roomId: string;
  messageId: string;
  orderId: string;
  targetStore?: string;
  kurir?: string;
  resi?: string;
  session: UserSession | null;
}): Promise<{
  success: boolean;
  alreadyConfirmed?: boolean;
  message: string;
  updatedOrder?: ManualShipmentOrder;
}> {
  const cleanOrderId = String(params.orderId || '').replace(/^#/, '').trim();
  if (!cleanOrderId) {
    return { success: false, message: 'Nomor pesanan tidak valid.' };
  }
  if (!params.session?.username) {
    return { success: false, message: 'Silakan login terlebih dahulu.' };
  }

  try {
    const order = await fetchManualShipmentByOrderId(cleanOrderId);
    if (!order) {
      return {
        success: false,
        message: `Pesanan #${cleanOrderId} tidak ditemukan di database.`,
      };
    }

    if (order.status === 'batal') {
      return {
        success: false,
        message: `Pesanan #${cleanOrderId} sudah berstatus DIBATALKAN sehingga tidak perlu dikirim.`,
      };
    }

    const nowIso = new Date().toISOString();
    const todayYmd = nowIso.slice(0, 10);
    const actorName =
      params.session.name ||
      getUserPersonName(params.session.username) ||
      params.session.store_name ||
      params.session.username;

    const arData: any = order.alteration_repair_data ? { ...order.alteration_repair_data } : {};
    const flowStr = String(arData.status_flow || '').toLowerCase();
    const targetStoreCheck = params.targetStore || params.session.store_name || '';
    const relevantStoreItems = (order.items || []).filter(
      (it) =>
        it.fulfillment &&
        !isGudangFulfillment(it.fulfillment) &&
        it.item_status !== 'sold_out' &&
        it.item_status !== 'cancelled' &&
        (!targetStoreCheck || isSameStore(it.fulfillment, targetStoreCheck))
    );
    const allTargetStoreItemsReceived =
      relevantStoreItems.length > 0 && relevantStoreItems.every((it) => Boolean(it.received_at_warehouse));

    const alreadyReceived =
      allTargetStoreItemsReceived ||
      Boolean(arData.tgl_terima_warehouse) ||
      ['diterima_warehouse', 'dalam_pengerjaan', 'selesai_qc', 'siap_dikirim', 'dikirim_kembali', 'selesai'].includes(
        flowStr
      ) ||
      order.status === 'dikirim' ||
      order.status === 'selesai';

    if (alreadyReceived) {
      await liveChatManager.updateMessageOrderContext(
        params.roomId,
        params.messageId,
        {
          status: 'Sudah Diterima WH',
          action_confirmed_at: arData.tgl_kirim_store || arData.tgl_terima_warehouse || nowIso,
          action_confirmed_by: arData.pic_kirim_store || arData.pic_terima_warehouse || 'Gudang Pusat',
          action_confirmed_kurir: arData.kurir_kirim_store || undefined,
          action_confirmed_resi: arData.resi_kirim_store || undefined,
        },
        { orderId: cleanOrderId, targetStore: params.targetStore }
      );
      return {
        success: true,
        alreadyConfirmed: true,
        message: `Pesanan #${cleanOrderId} sudah tercatat diterima di Gudang Pusat.`,
        updatedOrder: order,
      };
    }

    const dispatchStore =
      getFullStoreName(params.targetStore || params.session.store_name || getRequesterStoreName(order)) ||
      params.targetStore ||
      params.session.store_name ||
      'Store';

    const kurirLabel = String(params.kurir || '').trim() || 'Kurir Internal Toko';
    const resiLabel = String(params.resi || '').trim();

    const existingFlowLogs = Array.isArray(arData.flow_logs) ? [...arData.flow_logs] : [];
    const logNote = `Barang dikonfirmasi SUDAH DIKIRIM dari Store (${dispatchStore}) ke Warehouse via ${kurirLabel}${
      resiLabel ? ` (Resi: ${resiLabel})` : ''
    } [Konfirmasi via Live Chat]`;

    existingFlowLogs.push({
      id: `flow-${Date.now()}`,
      stage: 'dikirim_store',
      timestamp: nowIso,
      actor_name: actorName,
      notes: logNote,
    });

    const updatedArData = {
      ...arData,
      tgl_kirim_store: todayYmd,
      kurir_kirim_store: kurirLabel,
      resi_kirim_store: resiLabel,
      pic_kirim_store: actorName,
      status_flow: 'dikirim_store' as const,
      flow_logs: existingFlowLogs,
    };

    const existingHistory = Array.isArray(order.history_logs) ? order.history_logs : [];
    const updatedOrder: ManualShipmentOrder = {
      ...order,
      status: order.status === 'diproses' ? 'diproses' : 'diterima',
      alteration_repair_data: updatedArData,
      history_logs: [
        {
          id: `log-chat-sent-${Date.now()}`,
          timestamp: nowIso,
          actor: actorName,
          action: 'edited',
          note: logNote,
        },
        ...existingHistory,
      ],
    };

    const saveRes = await editManualShipment(updatedOrder);
    if (!saveRes.success) {
      return {
        success: false,
        message: `Gagal menyimpan status kirim: ${saveRes.message}`,
      };
    }

    // 1. Update status kartu reminder di Live Chat agar tombol berubah menjadi badge "Sudah Dikonfirmasi Kirim"
    await liveChatManager.updateMessageOrderContext(
      params.roomId,
      params.messageId,
      {
        status: 'Dikirim ke WH',
        action_confirmed_at: nowIso,
        action_confirmed_by: actorName,
        action_confirmed_kurir: kurirLabel,
        action_confirmed_resi: resiLabel || undefined,
      },
      { orderId: cleanOrderId, targetStore: dispatchStore }
    );

    // 2. Kirim pesan konfirmasi ke ruang chat Store Ops (+ mirror ke Store Pemohon jika antar-store)
    const storeItems = (updatedOrder.items || []).filter(
      (it) =>
        it.fulfillment &&
        !isGudangFulfillment(it.fulfillment) &&
        (!dispatchStore || isSameStore(it.fulfillment, dispatchStore))
    );
    const itemsForSummary = storeItems.length > 0 ? storeItems : updatedOrder.items || [];
    const productSummary =
      itemsForSummary
        .map((it) => it.nama_produk)
        .filter(Boolean)
        .join(', ') || 'Produk Pesanan';
    const skuSummary =
      itemsForSummary
        .map((it) => it.sku)
        .filter(Boolean)
        .join(', ') || '-';

    void notifyAlterationActionToChat(
      updatedOrder,
      'mark_sent_store',
      {
        dispatchingStoreName: dispatchStore,
        kurir: kurirLabel,
        resi: resiLabel,
        tgl: todayYmd,
        pic: actorName,
        productSummary,
        skuSummary,
      },
      actorName
    );

    // 3. Zero-reload sync ke Rekap Pesanan jika sedang terbuka di tab desktop
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('wms_manual_shipment_updated', {
          detail: { orderId: cleanOrderId, order: updatedOrder },
        })
      );
    }

    return {
      success: true,
      message: `Konfirmasi kirim #${cleanOrderId} ke Gudang berhasil dicatat!`,
      updatedOrder,
    };
  } catch (err: any) {
    console.warn('[OrderChatNotify] confirmStoreSentToWarehouseFromChat error:', err);
    return {
      success: false,
      message: err?.message || 'Terjadi kesalahan saat mengonfirmasi pengiriman.',
    };
  }
}

// =============================================================================
// AUTO-HEALING & BACKFILL FOR MISSED ORDERS / OLD CACHED STORE CLIENTS
// =============================================================================

const inFlightOrderChatSync = new Map<string, Promise<{ createdOrSent: number }>>();
const completedOrderChatSyncKeys = new Set<string>();
let lastSessionStoreOpsSyncAt = 0;
let activeSessionStoreOpsSyncPromise: Promise<{ ensuredCount: number; backfilledOrders: number }> | null = null;

function normalizeRawManualShipmentRow(item: any): ManualShipmentOrder | null {
  if (!item || typeof item !== 'object') return null;
  const noPesanan = String(item.no_pesanan || '').trim().toUpperCase();
  const rawNotes = String(item.notes_paket || '');
  if (noPesanan.startsWith('RTR-') || rawNotes.includes('[RETUR_BARANG]:')) {
    return null;
  }

  let alteration_repair_data = item.alteration_repair_data;
  if (!alteration_repair_data && rawNotes.includes('[ALTERATION_REPAIR]:')) {
    try {
      const part = rawNotes.split('[ALTERATION_REPAIR]:')[1] || '';
      const nextIdx = part.search(/\[(HISTORI_LOGS|STORE_METADATA)\]:/);
      const jsonStr = nextIdx !== -1 ? part.substring(0, nextIdx) : part;
      alteration_repair_data = JSON.parse(jsonStr.trim());
    } catch {}
  }

  let parsedItems = item.items;
  if (typeof parsedItems === 'string' && parsedItems.trim()) {
    try {
      parsedItems = JSON.parse(parsedItems);
    } catch {
      parsedItems = [];
    }
  }
  if (!Array.isArray(parsedItems)) {
    parsedItems = item.nama_produk || item.sku
      ? [
          {
            sku: item.sku || '-',
            nama_produk: item.nama_produk || 'Produk Pesanan',
            size: item.size || '-',
            qty: Number(item.qty) || 1,
            fulfillment: item.fulfillment || undefined,
          },
        ]
      : [];
  }

  const isMsPrefix = noPesanan.startsWith('MS');
  const isArPrefix = noPesanan.startsWith('AR-') || noPesanan.startsWith('REP-') || noPesanan.startsWith('ALT-');
  const isAlter = !isMsPrefix && (isArPrefix || hasValidArData(alteration_repair_data));

  return {
    ...item,
    notes_paket: stripInternalOrderMetadata(rawNotes),
    items: parsedItems,
    alteration_repair_data,
    order_type: item.order_type || (isAlter ? 'alteration_repair' : 'manual_shipment'),
  } as ManualShipmentOrder;
}

function buildSubmittedOrderMessageText(order: ManualShipmentOrder): string {
  const requesterStore = getRequesterStoreName(order);
  const orderId = getOrderId(order);
  const isAlterOrder = hasRealAlterItems(order) || order.order_type === 'alteration_repair';
  if (isAlterOrder) {
    return formatAlterWorkOrderText(order);
  }
  const items = Array.isArray(order.items) ? order.items : [];
  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const itemsListStr = items
    .map(
      (it, idx) =>
        `  ${idx + 1}. [${it.sku || '-'}] ${it.nama_produk} (Qty: ${it.qty || 1} pcs, Fulfillment: ${it.fulfillment || '-'})` +
        (it.needs_alteration
          ? `\n     ✂️ [Alteration: ${it.id_form_alter || 'Auto'}] ${it.alteration_detail || '-'}`
          : '')
    )
    .join('\n');

  return (
    `📦 KONFIRMASI PESANAN MANUAL SHIPMENT BARU\n` +
    `────────────────────────────────────\n` +
    `• Order ID: #${orderId}\n` +
    `• Store Pengirim: ${requesterStore} (PIC: ${order.pic_store || '-'})\n` +
    `• No. DealPOS: ${formatDealposStr(order)}\n` +
    `• Customer: ${order.nama_tujuan || '-'} (${order.no_telp_tujuan || '-'})\n` +
    `• Alamat: ${order.alamat_tujuan || '-'}\n` +
    `• Jasa Kirim: ${order.jasa_kirim || '-'}\n\n` +
    `📋 Daftar Produk (${totalQty} pcs):\n${itemsListStr}\n\n` +
    `📝 Catatan Paket: ${stripInternalOrderMetadata(order.notes_paket) || '-'}`
  );
}

/**
 * Idempotently ensures the Store Ops group(s) and initial submission message exist for a single order.
 * Checks Supabase hot messages per room first so updated Store clients never trigger duplicates.
 */
export async function ensureSingleOrderSubmittedChatSynced(
  order: ManualShipmentOrder
): Promise<{ createdOrSent: number }> {
  const orderId = getOrderId(order);
  if (!orderId || orderId === '-') return { createdOrSent: 0 };
  if (String(order.status || '').trim().toLowerCase() === 'batal') {
    return { createdOrSent: 0 };
  }

  const dedupeKey = orderId.toUpperCase();
  if (completedOrderChatSyncKeys.has(dedupeKey)) {
    return { createdOrSent: 0 };
  }
  const existingPromise = inFlightOrderChatSync.get(dedupeKey);
  if (existingPromise) {
    return existingPromise;
  }

  const task = (async (): Promise<{ createdOrSent: number }> => {
    let createdOrSent = 0;
    try {
      const requesterStore = getRequesterStoreName(order);
      const actor = order.pic_store || order.alteration_repair_data?.pic_pemohon || order.submitted_by || 'Tim Store';

      if (requesterStore) {
        const resolvedReq = await liveChatManager.resolveStoreAccountForGroup(requesterStore);
        if (resolvedReq) {
          const roomId = `group_ops_${resolvedReq.canonicalCodeLower}`;
          const check = await liveChatManager.hasOrderMessageInRoom(roomId, orderId);
          if (check.ok && !check.found) {
            const msgText = buildSubmittedOrderMessageText(order);
            if (msgText) {
              const res = await liveChatManager.sendSystemGroupMessage({
                storeName: requesterStore,
                text: msgText,
                contextTags: buildOrderTags(order),
                orderContext: buildOrderContext(order),
                eventType: 'order_submit',
                actorName: actor,
              });
              if (res.success) createdOrSent++;
            }
          }
        }
      }

      const fulfillmentData = resolveOrderFulfillmentStores(order);
      for (const group of fulfillmentData.groups) {
        if (!group.isInterStore || group.isGudangGroup) continue;
        const resolvedSup = await liveChatManager.resolveStoreAccountForGroup(group.storeName);
        if (!resolvedSup) continue;
        const supRoomId = `group_ops_${resolvedSup.canonicalCodeLower}`;
        const supCheck = await liveChatManager.hasOrderMessageInRoom(supRoomId, orderId);
        if (supCheck.ok && !supCheck.found) {
          const interStoreText = formatInterStoreRequestText(
            order,
            group.storeName,
            fulfillmentData.requesterStoreName,
            group.items
          );
          const interRes = await liveChatManager.sendSystemGroupMessage({
            storeName: group.storeName,
            text: interStoreText,
            contextTags: buildOrderTags({ ...order, items: group.items }),
            orderContext: buildOrderContext(order),
            eventType: 'interstore_request',
            actorName: actor,
          });
          if (interRes.success) createdOrSent++;
        }
      }

      completedOrderChatSyncKeys.add(dedupeKey);
    } catch (err) {
      console.warn('[OrderChatNotify] ensureSingleOrderSubmittedChatSynced error:', err);
    } finally {
      inFlightOrderChatSync.delete(dedupeKey);
    }
    return { createdOrSent };
  })();

  inFlightOrderChatSync.set(dedupeKey, task);
  return task;
}

/**
 * Receiver-side auto-healing when @warehouse / @chocoadm receives a new order notification.
 * Waits 3.2s so updated Store browsers finish sending first, then creates/backfills the group if still missing
 * (e.g. if the Store submitted from an old cached PWA bundle or closed the tab right after submit).
 */
export async function ensureIncomingOrderChatSynced(rawRow: any): Promise<void> {
  const order = normalizeRawManualShipmentRow(rawRow);
  if (!order) return;
  const orderId = getOrderId(order);
  if (!orderId || orderId === '-') return;
  if (completedOrderChatSyncKeys.has(orderId.toUpperCase())) return;

  await new Promise((r) => setTimeout(r, 3200));
  await ensureSingleOrderSubmittedChatSynced(order);
}

/**
 * Ensures permanent Store Ops ([MS & Alter]) groups exist for the current session:
 * - Store accounts: ensures their own `[MS & Alter] <Store>` group exists immediately on login.
 * - Core Warehouse/Admin (`@warehouse` / `@chocoadm`): batch-ensures all official Store Ops groups
 *   AND backfills any recent orders from the last 48h that are missing from their Store's chat group.
 */
export async function ensureStoreOpsGroupsForSession(
  session: UserSession | null,
  options?: { forceBackfill?: boolean }
): Promise<{ ensuredCount: number; backfilledOrders: number }> {
  if (!session?.username) return { ensuredCount: 0, backfilledOrders: 0 };

  const uname = session.username.trim().toLowerCase();
  const roleLower = String(session.role || '').trim().toLowerCase();
  if (roleLower === 'customer service' || uname.startsWith('chococs')) {
    return { ensuredCount: 0, backfilledOrders: 0 };
  }

  // Store accounts only ensure their own Store Ops group
  if (isStoreAccountSession(session)) {
    const myStore = String(session.store_name || session.name || '').trim();
    const myCode = String(session.store_code || '').trim();
    if (!myStore && !myCode) return { ensuredCount: 0, backfilledOrders: 0 };
    const room = await liveChatManager.ensureStoreOpsGroupRoom({
      storeName: myStore || myCode,
      storeCode: myCode || undefined,
      targetStoreUsername: uname,
    });
    return { ensuredCount: room ? 1 : 0, backfilledOrders: 0 };
  }

  // Only core Warehouse / Admin accounts provision all Store Ops groups & backfill missed orders
  if (uname !== 'warehouse' && uname !== 'chocoadm') {
    return { ensuredCount: 0, backfilledOrders: 0 };
  }

  const now = Date.now();
  if (!options?.forceBackfill && now - lastSessionStoreOpsSyncAt < 2 * 60 * 1000) {
    return { ensuredCount: 0, backfilledOrders: 0 };
  }

  if (activeSessionStoreOpsSyncPromise) {
    return activeSessionStoreOpsSyncPromise;
  }

  activeSessionStoreOpsSyncPromise = (async () => {
    lastSessionStoreOpsSyncAt = Date.now();
    let ensuredCount = 0;
    let backfilledOrders = 0;

    try {
      const storeMap = new Map<string, { storeName: string; storeCode?: string }>();
      for (const o of DEFAULT_OUTLETS) {
        if (o?.nama) {
          storeMap.set(o.nama.toLowerCase(), { storeName: o.nama, storeCode: o.kode });
        }
      }
      const contacts = getAllStoreContacts();
      for (const c of Object.values(contacts)) {
        if (c?.nama && !isGudangFulfillment(c.nama)) {
          const full = getFullStoreName(c.nama) || c.nama;
          if (!storeMap.has(full.toLowerCase())) {
            storeMap.set(full.toLowerCase(), { storeName: full, storeCode: c.kode });
          }
        }
      }

      const upsertedRooms = await liveChatManager.ensureBatchStoreOpsGroupRooms(
        Array.from(storeMap.values())
      );
      ensuredCount = upsertedRooms.length;

      // Backfill any recent orders (last 48 hours) that never reached their Store Ops group
      const cutoffIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const recentRows = await supabaseFetch<any[]>(
        'manual_shipment',
        'GET',
        null,
        `select=*&created_at=gte.${encodeURIComponent(cutoffIso)}&order=created_at.desc&limit=50`
      );

      if (Array.isArray(recentRows) && recentRows.length > 0) {
        // Process chronological oldest-first so messages appear in proper time order
        const chronological = [...recentRows].reverse();
        for (const row of chronological) {
          const createdMs = row?.created_at ? new Date(row.created_at).getTime() : 0;
          if (createdMs > 0 && Date.now() - createdMs < 4000) continue; // Let live sender finish
          const normalized = normalizeRawManualShipmentRow(row);
          if (!normalized) continue;
          const res = await ensureSingleOrderSubmittedChatSynced(normalized);
          if (res.createdOrSent > 0) {
            backfilledOrders += res.createdOrSent;
          }
        }
      }
    } catch (err) {
      console.warn('[OrderChatNotify] ensureStoreOpsGroupsForSession warning:', err);
    } finally {
      activeSessionStoreOpsSyncPromise = null;
    }

    return { ensuredCount, backfilledOrders };
  })();

  return activeSessionStoreOpsSyncPromise;
}

