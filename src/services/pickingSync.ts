import { supabaseFetch } from './supabase';
import { sendFonnteMessage, getFonnteConfig, normalizeWhatsAppNumber } from './whatsapp';
import { PickingListItem } from '../types';

export async function processPickingSync(logEntry: any) {
  // Hanya proses jika ada invoice yang kemungkinan adalah invoice_picking
  if (!logEntry.invoice || !logEntry.invoice.startsWith('WA')) {
    return;
  }

  try {
    const invoice = logEntry.invoice;
    const skuUpper = (logEntry.sku || '').toUpperCase().trim();

    // 1. Ambil baris picking_list yang sesuai dengan invoice & sku ini
    const query = `select=*&invoice_picking=eq.${invoice}&sku=eq.${skuUpper}`;
    const pickingRows = await supabaseFetch<PickingListItem[]>('picking_list', 'GET', null, query);
    
    if (!pickingRows || pickingRows.length === 0) {
      // Tidak ditemukan di picking list, berarti log ini tidak terkait dengan tugas picking yang aktif
      return;
    }

    const targetRow = pickingRows[0];

    // 2. Ambil semua log_produk untuk invoice & sku ini untuk re-kalkulasi
    const logQuery = `select=type,qty&invoice=eq.${invoice}&sku=eq.${skuUpper}`;
    const allLogs = await supabaseFetch<any[]>('log_produk', 'GET', null, logQuery);

    if (!allLogs || !Array.isArray(allLogs)) return;

    // 3. Kalkulasi total qty_picked
    // Aturan: #OUT = barang diambil dari rak (qty_picked bertambah)
    // #IN = barang dikembalikan ke rak (qty_picked berkurang)
    let totalPicked = 0;
    for (const log of allLogs) {
      const type = (log.type || '').toUpperCase();
      const qty = Number(log.qty) || 0;
      if (type === 'OUT' || type === 'ADJ_OUT') {
        totalPicked += qty;
      } else if (type === 'IN' || type === 'ADJ_IN') {
        totalPicked -= qty;
      }
    }

    // Pastikan qty_picked tidak negatif
    if (totalPicked < 0) totalPicked = 0;

    // 4. Update qty_picked di Supabase
    if (targetRow.qty_picked !== totalPicked) {
      await supabaseFetch('picking_list', 'PATCH', { qty_picked: totalPicked }, `id=eq.${targetRow.id}`);
      console.log(`[PickingSync] Updated invoice ${invoice} SKU ${skuUpper} qty_picked: ${totalPicked}`);
    }

    // 5. Kirim Notifikasi via Fonnte jika ada anomali
    const selisih = targetRow.qty_req - totalPicked;
    if (selisih !== 0) {
      const fonnteCfg = getFonnteConfig();
      if (!fonnteCfg.token || !fonnteCfg.groupTarget || !fonnteCfg.autoSendEnabled) {
        return; // Fonnte tidak diatur atau dimatikan
      }

      const targetGroup = normalizeWhatsAppNumber(fonnteCfg.groupTarget);
      let pesan = '';
      if (selisih > 0) {
        pesan = `⚠️ *[Peringatan Picking]*\nSurat Jalan: ${targetRow.no_sj}\nInvoice: ${invoice}\nSKU: ${skuUpper}\nStatus: Kurang ${selisih} pcs.\n(Target: ${targetRow.qty_req}, Terambil: ${totalPicked})`;
      } else if (selisih < 0) {
        pesan = `⚠️ *[Peringatan Picking]*\nSurat Jalan: ${targetRow.no_sj}\nInvoice: ${invoice}\nSKU: ${skuUpper}\nStatus: Kelebihan ${Math.abs(selisih)} pcs.\n(Target: ${targetRow.qty_req}, Terambil: ${totalPicked})`;
      }

      await sendFonnteMessage({
        target: targetGroup,
        message: pesan,
        token: fonnteCfg.token
      });
      console.log(`[PickingSync] Fonnte alert sent for ${invoice} - ${skuUpper}`);
    }

  } catch (err) {
    console.error('[PickingSync] Error processing log entry:', err);
  }
}
