import { ManualShipmentOrder, ManualShipmentHistoryLog } from '../types';
import { supabaseFetch } from './supabase';

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
  const upper = trimmed.toUpperCase();
  if (STORE_CODE_TO_FULL_NAME[upper]) {
    return STORE_CODE_TO_FULL_NAME[upper];
  }
  return trimmed;
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

export const DEFAULT_JASA_KIRIM: string[] = [
  'JNE Regular', 'JNE YES', 'J&T Express', 'SiCepat REG', 'SiCepat BEST',
  'Anteraja Regular', 'Anteraja Same Day', 'GoSend Instant', 'GoSend Same Day',
  'GrabExpress Instant', 'GrabExpress Same Day', 'Paxel', 'SPX Standard',
  'SPX Instant', 'Lion Parcel', 'Wahana', 'Kurir Toko / Internal',
];

export async function fetchJasaKirimList(): Promise<string[]> {
  try {
    const raw = localStorage.getItem('wms_cached_jasa_kirim');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_JASA_KIRIM;
}

export async function fetchOutlets(): Promise<{ id?: string, nama: string; fulfillment: string; kode?: string }[]> {
  try {
    const result: { id?: string; nama: string; fulfillment: string; kode?: string }[] = [];
    const seenNames = new Set<string>();

    // 1. Ambil dari outlet_config jika ada
    const data = await supabaseFetch<any[]>('outlet_config', 'GET', null, 'select=*&order=nama.asc');
    if (data && data.length > 0) {
      data.forEach(d => {
        if (d.nama) {
          const rawName = d.nama.trim();
          const fullName = getFullStoreName(d.fulfillment || rawName);
          const kode = d.kode || Object.keys(STORE_CODE_TO_FULL_NAME).find(k => STORE_CODE_TO_FULL_NAME[k].toLowerCase() === fullName.toLowerCase()) || rawName.toUpperCase();
          if (!seenNames.has(fullName.toLowerCase())) {
            seenNames.add(fullName.toLowerCase());
            result.push({
              id: d.id,
              nama: fullName,
              fulfillment: fullName,
              kode: kode,
            });
          }
        }
      });
    }

    // 2. Gabungkan dengan DEFAULT_OUTLETS (Master Produk & DealPOS)
    DEFAULT_OUTLETS.forEach(d => {
      if (!seenNames.has(d.nama.toLowerCase())) {
        seenNames.add(d.nama.toLowerCase());
        result.push(d);
      }
    });

    return result;
  } catch (err) {
    console.warn('Error fetching outlets', err);
  }
  return DEFAULT_OUTLETS;
}

export async function saveOutlet(outlet: { id?: string, nama: string, fulfillment: string }): Promise<{ success: boolean; message: string }> {
  try {
    if (outlet.id) {
      await supabaseFetch('outlet_config', 'PATCH', {
        nama: outlet.nama,
        fulfillment: outlet.fulfillment
      }, `id=eq.${outlet.id}`);
      return { success: true, message: 'Berhasil mengupdate store' };
    } else {
      await supabaseFetch('outlet_config', 'POST', [{
        nama: outlet.nama,
        fulfillment: outlet.fulfillment,
        created_at: new Date().toISOString()
      }]);
      return { success: true, message: 'Berhasil menambahkan store baru' };
    }
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menyimpan data store' };
  }
}

export async function deleteOutlet(id: string): Promise<{ success: boolean; message: string }> {
  try {
    await supabaseFetch('outlet_config', 'DELETE', null, `id=eq.${id}`);
    return { success: true, message: 'Berhasil menghapus store' };
  } catch (err: any) {
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

    const submitPayload: any = {
      ...rest,
      notes_paket: notes,
      created_at: payload.created_at || new Date().toISOString()
    };

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
    
    // Hapus field tambahan dari UI agar tidak crash di schema DB
    delete submitPayload.email_customer;
    delete submitPayload.email_store;
    delete submitPayload.pic_store;

    await supabaseFetch('manual_shipment', 'POST', [submitPayload]);
    return { success: true, message: 'Berhasil menyimpan data ke Supabase' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menyimpan ke Supabase' };
  }
}

export async function fetchManualShipments(): Promise<ManualShipmentOrder[]> {
  try {
    const data = await supabaseFetch<any[]>('manual_shipment', 'GET', null, 'select=*&order=created_at.desc');
    if (!data) return [];
    
    return data.map(item => {
      let history_logs: ManualShipmentHistoryLog[] = [];
      let alteration_repair_data: any = undefined;
      let notes = item.notes_paket || '';
      
      if (notes.includes('[ALTERATION_REPAIR]:')) {
        const parts = notes.split('[ALTERATION_REPAIR]:');
        notes = parts[0].trim();
        const remain = parts[1];
        if (remain) {
          if (remain.includes('[HISTORI_LOGS]:')) {
            const subParts = remain.split('[HISTORI_LOGS]:');
            try {
              alteration_repair_data = JSON.parse(subParts[0].trim());
            } catch {}
            try {
              history_logs = JSON.parse(subParts[1].trim());
            } catch {}
          } else {
            try {
              alteration_repair_data = JSON.parse(remain.trim());
            } catch {}
          }
        }
      } else if (notes.includes('[HISTORI_LOGS]:')) {
        const parts = notes.split('[HISTORI_LOGS]:');
        notes = parts[0].trim();
        try {
          history_logs = JSON.parse(parts[1].trim());
        } catch {}
      }

      // Deteksi order_type
      const noPesanan = (item.no_pesanan || '').toUpperCase();
      const isAlterationRepair = !!alteration_repair_data || noPesanan.startsWith('AR-') || noPesanan.startsWith('REP-') || noPesanan.startsWith('ALT-');
      const order_type = isAlterationRepair ? 'alteration_repair' : 'manual_shipment';

      return {
        ...item,
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
        history_logs: history_logs.length > 0 ? history_logs : (item.history_logs || [])
      } as ManualShipmentOrder;
    });
  } catch (err) {
    console.warn('Error fetching manual shipments', err);
    return [];
  }
}

export async function updateShipmentStatus(id: string, status: string): Promise<boolean> {
  try {
    await supabaseFetch('manual_shipment', 'PATCH', { status }, `id=eq.${id}`);
    return true;
  } catch (err) {
    console.warn('Error updateShipmentStatus', err);
    return false;
  }
}

export async function updateShipmentResi(id: string, resi: string, timestamp?: string): Promise<boolean> {
  try {
    const payload: any = { no_resi: resi };
    if (timestamp) {
      payload.tanggal_scan = timestamp;
    }
    await supabaseFetch('manual_shipment', 'PATCH', payload, `id=eq.${id}`);
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

          await supabaseFetch('manual_shipment', 'PATCH', payload, filter);
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
    if (!payload.id) {
      return { success: false, message: 'ID tidak ditemukan untuk diupdate' };
    }
    const { id, history_logs, alteration_repair_data, ...rest } = payload as any;
    
    // Simpan metadata ke notes_paket
    let notes = (rest.notes_paket || '')
      .replace(/\n?\[ALTERATION_REPAIR\]:[\s\S]*?(?=\n\[HISTORI_LOGS\]:|$)/, '')
      .replace(/\n?\[HISTORI_LOGS\]:[\s\S]*$/, '')
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

    const patchPayload: any = {
      ...rest,
      notes_paket: notes,
      updated_at: new Date().toISOString()
    };

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
    
    // Hapus field tambahan UI
    delete patchPayload.email_customer;
    delete patchPayload.email_store;
    delete patchPayload.pic_store;

    await supabaseFetch('manual_shipment', 'PATCH', patchPayload, `id=eq.${payload.id}`);
    return { success: true, message: 'Berhasil mengupdate data' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal mengupdate data' };
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
    } else if (newStage === 'siap_dikirim') {
      newStatus = 'dikirim';
    } else if (newStage === 'selesai') {
      newStatus = 'selesai';
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
      if ((it.fulfillment || '').toLowerCase().includes('marketplace')) {
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
