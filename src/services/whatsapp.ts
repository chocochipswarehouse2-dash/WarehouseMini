import { PeminjamanRecord } from '../types';

export interface FonnteConfig {
  token: string;
  groupTarget: string;
  autoSendEnabled: boolean;
}

export interface SendFonnteResult {
  success: boolean;
  message: string;
  response?: any;
}

/**
 * Membersihkan dan menormalkan format nomor WhatsApp Indonesia
 * Contoh: '08123456789' -> '628123456789'
 * Contoh: '+62 812-3456-789' -> '628123456789'
 * Mendukung juga format Group ID Fonnte: '12036302...@g.us'
 */
export function normalizeWhatsAppNumber(phone: string): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  
  // Jika ini adalah Fonnte Group ID (mengandung @g.us)
  if (trimmed.includes('@g.us')) {
    return trimmed;
  }

  // Hapus karakter non-digit kecuali jika ada plus di awal
  let digits = trimmed.replace(/\D/g, '');

  // Format lokal Indonesia (08...) -> 628...
  if (digits.startsWith('08')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  } else if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  }

  return digits;
}

/**
 * Mengambil konfigurasi WhatsApp Fonnte dari LocalStorage
 */
export function getFonnteConfig(): FonnteConfig {
  const token = (localStorage.getItem('wms_fonnte_token') || '').trim();
  const groupTarget = (localStorage.getItem('wms_fonnte_group_target') || '').trim();
  const rawAuto = localStorage.getItem('wms_fonnte_auto_send');
  // Default aktif jika token sudah diisi
  const autoSendEnabled = rawAuto !== null ? rawAuto === 'true' : Boolean(token);

  return {
    token,
    groupTarget,
    autoSendEnabled,
  };
}

/**
 * Menyimpan konfigurasi WhatsApp Fonnte ke LocalStorage
 */
export function saveFonnteConfig(config: Partial<FonnteConfig>) {
  if (config.token !== undefined) {
    localStorage.setItem('wms_fonnte_token', config.token.trim());
  }
  if (config.groupTarget !== undefined) {
    localStorage.setItem('wms_fonnte_group_target', config.groupTarget.trim());
  }
  if (config.autoSendEnabled !== undefined) {
    localStorage.setItem('wms_fonnte_auto_send', String(config.autoSendEnabled));
  }
}

/**
 * Mengirim pesan WhatsApp melalui Fonnte API
 */
export async function sendFonnteMessage(
  target: string,
  message: string,
  customToken?: string
): Promise<SendFonnteResult> {
  const token = customToken || getFonnteConfig().token;
  const cleanTarget = normalizeWhatsAppNumber(target);

  if (!token) {
    return {
      success: false,
      message: 'Token API Fonnte belum diatur. Silakan atur di menu Pengaturan > Integrasi WhatsApp.',
    };
  }

  if (!cleanTarget) {
    return {
      success: false,
      message: 'Nomor WhatsApp tujuan kosong atau tidak valid.',
    };
  }

  if (!message || !message.trim()) {
    return {
      success: false,
      message: 'Isi pesan WhatsApp tidak boleh kosong.',
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('target', cleanTarget);
    formData.append('message', message.trim());
    formData.append('countryCode', '62');

    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': token,
      },
      body: formData,
    });

    const data = await response.json();

    if (data.status === true || data.status === 'true' || response.ok) {
      return {
        success: true,
        message: 'Pesan berhasil dikirim via Fonnte.',
        response: data,
      };
    } else {
      const errMsg = data.reason || data.detail || data.message || 'Gagal mengirim pesan via Fonnte.';
      return {
        success: false,
        message: `Fonnte Error: ${errMsg}`,
        response: data,
      };
    }
  } catch (err) {
    const errText = err instanceof Error ? err.message : 'Koneksi ke server Fonnte gagal.';
    return {
      success: false,
      message: `Gagal terhubung ke API Fonnte: ${errText}`,
    };
  }
}

/**
 * Membuat pesan WhatsApp Picking List untuk Grup WhatsApp Gudang
 */
export function generatePeminjamanGroupMessage(
  record: PeminjamanRecord,
  operatorName?: string,
  noWaPeminjam?: string
): string {
  const items = record.items || [];
  const totalQty = items.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
  const totalItems = items.length;

  const itemsList = items
    .map((it, idx) => {
      const itemNum = idx + 1;
      const cleanSize = it.size || '-';
      const cleanLoc = it.lokasi || 'BLOK F';
      const cleanSku = it.sku || '-';
      return (
        `${itemNum}. 📦 *${it.produk}*\n` +
        `   ├ Size    : *${cleanSize}*\n` +
        `   ├ SKU     : \`${cleanSku}\`\n` +
        `   ├ QTY     : *${it.qty} pcs*\n` +
        `   └ 📍 Lokasi: *${cleanLoc}*`
      );
    })
    .join('\n\n');

  const picPhoneStr = noWaPeminjam ? ` (${noWaPeminjam})` : (record.noWaPeminjam ? ` (${record.noWaPeminjam})` : '');
  const operatorStr = operatorName || record.username || 'Petugas WMS';
  const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return (
    `*🚨 PICKING LIST PEMINJAMAN (SPS)*\n` +
    `*No. Dokumen:* \`${record.noPeminjaman}\`\n\n` +
    `*INFORMASI PEMINJAM:*\n` +
    `• PIC / Peminjam : *${record.namaPeminjam}*${picPhoneStr}\n` +
    `• Keperluan      : ${record.keperluan}\n` +
    `• Tanggal Pinjam : ${record.tglPinjam}\n` +
    `• Waktu Submit   : ${timeStr} WIB\n` +
    `• Operator Input : ${operatorStr}\n\n` +
    `📋 *DAFTAR ITEM UNTUK PICKING (${totalItems} Item / ${totalQty} Pcs):*\n` +
    `${itemsList}\n\n` +
    `Mohon tim gudang segera siapkan barang dan cetak Surat Jalan (SJ).\n` +
    `_Status Sistem: PENDING PICKING_ ⏳`
  );
}

/**
 * Membuat pesan WhatsApp notifikasi ke nomor pribadi peminjam
 */
export function generatePeminjamanPersonalMessage(
  record: PeminjamanRecord,
  operatorName?: string
): string {
  const items = record.items || [];
  const totalQty = items.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);

  const itemsList = items
    .map((it, idx) => {
      return `${idx + 1}. *${it.produk}* | Size: *${it.size || '-'}* | Qty: *${it.qty} pcs*`;
    })
    .join('\n');

  const operatorStr = operatorName || record.username || 'Petugas Gudang';

  return (
    `Halo Kak *${record.namaPeminjam}* 👋,\n\n` +
    `Pengajuan peminjaman produk kamu telah *BERHASIL KAMI TERIMA* di sistem Gudang:\n\n` +
    `📄 *DATA PEMINJAMAN*\n` +
    `• No. Dokumen : *${record.noPeminjaman}*\n` +
    `• Keperluan   : ${record.keperluan}\n` +
    `• Tgl Pinjam  : ${record.tglPinjam}\n` +
    `• Penerima    : ${operatorStr}\n\n` +
    `📦 *DAFTAR PRODUK (${totalQty} pcs):*\n` +
    `${itemsList}\n\n` +
    `Data peminjaman ini telah kami kirimkan ke tim gudang untuk proses picking & penyiapan fisik barang.\n` +
    `Silakan konfirmasi ke petugas gudang saat pengambilan barang fisik ya. Terima kasih! 🙏✨\n\n` +
    `_WMS Chocochips Warehouse_`
  );
}

/**
 * Mengirimkan otomatis kedua notifikasi WA (Grup Gudang + Pribadi Peminjam)
 */
export async function sendPeminjamanAutoWhatsApp(
  record: PeminjamanRecord,
  options?: {
    noWaPeminjam?: string;
    operatorName?: string;
    sendGroup?: boolean;
    sendPersonal?: boolean;
  }
): Promise<{
  group: { attempted: boolean; success: boolean; message: string };
  personal: { attempted: boolean; success: boolean; message: string };
}> {
  const config = getFonnteConfig();
  const shouldSendGroup = options?.sendGroup !== undefined ? options.sendGroup : true;
  const shouldSendPersonal = options?.sendPersonal !== undefined ? options.sendPersonal : true;

  const result = {
    group: { attempted: false, success: false, message: 'Tidak dikirim' },
    personal: { attempted: false, success: false, message: 'Tidak dikirim' },
  };

  if (!config.token) {
    result.group.message = 'Token Fonnte belum diatur di Pengaturan';
    result.personal.message = 'Token Fonnte belum diatur di Pengaturan';
    return result;
  }

  // 1. Kirim Picking List ke Grup WhatsApp Gudang
  if (shouldSendGroup && config.groupTarget) {
    result.group.attempted = true;
    const groupMsg = generatePeminjamanGroupMessage(
      record,
      options?.operatorName,
      options?.noWaPeminjam || record.noWaPeminjam
    );
    const sendRes = await sendFonnteMessage(config.groupTarget, groupMsg, config.token);
    result.group.success = sendRes.success;
    result.group.message = sendRes.message;
  } else if (shouldSendGroup && !config.groupTarget) {
    result.group.message = 'Nomor grup WhatsApp gudang belum diatur di Pengaturan';
  }

  // 2. Kirim Notifikasi Pengajuan ke Nomor Pribadi Peminjam
  const personalTarget = options?.noWaPeminjam || record.noWaPeminjam || '';
  if (shouldSendPersonal && personalTarget.trim()) {
    result.personal.attempted = true;
    const personalMsg = generatePeminjamanPersonalMessage(record, options?.operatorName);
    const sendRes = await sendFonnteMessage(personalTarget, personalMsg, config.token);
    result.personal.success = sendRes.success;
    result.personal.message = sendRes.message;
  } else if (shouldSendPersonal && !personalTarget.trim()) {
    result.personal.message = 'Nomor WhatsApp peminjam belum diisi';
  }

  return result;
}

/**
 * Membuat link WhatsApp Web / wa.me untuk fallback pengiriman manual
 */
export function getWhatsAppWebUrl(phone: string, text: string): string {
  const cleanPhone = normalizeWhatsAppNumber(phone);
  const encodedText = encodeURIComponent(text);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}
