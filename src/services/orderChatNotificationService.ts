/**
 * Centralized WMS Live Chat Notification Dispatcher for Manual Shipment & Alteration Orders.
 *
 * Strictly enforces:
 * - 1 Store = 1 Permanent Group (`group_ops_<storeCode>` with ONLY @warehouse, @chocoadm, @choco<store>).
 * - Inter-Store Isolation: Supplier Store B NEVER enters Requester Store A's group;
 *   notifications are dispatched to Store B's own group and progress updates are mirrored back to Store A's group.
 * - Zero WA Fonnte dependency for Store/Admin WH coordination (Picking WA Grup remains Marketplace-only in ManualShipmentTab).
 */

import { ManualShipmentOrder, ManualShipmentItem, UserSession } from '../types';
import {
  liveChatManager,
  ChatContextTag,
  ChatOrderContext,
} from './liveChatService';
import {
  DEFAULT_OUTLETS,
  getAllStoreContacts,
  getFullStoreName,
  isSameStore,
  resolveOrderFulfillmentStores,
} from './gasManualShipment';
import { supabaseFetch } from './supabase';
import { isStoreAccountSession } from './permissions';
import { isRealAlterItem, hasRealAlterItems, hasValidArData } from '../utils/alterationUtils';

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

