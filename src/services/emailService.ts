import { ManualShipmentOrder } from '../types';
import { getGdriveConfig } from './gdriveUpload';

export type EmailNotificationEvent =
  | 'submit'
  | 'status_diterima'
  | 'status_diproses'
  | 'status_dikirim'
  | 'status_batal';

interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  fromName?: string;
}

/**
 * Kirim email via Google Apps Script (GAS) Webhook
 */
export async function sendEmailViaGas(params: SendEmailParams): Promise<{ success: boolean; message: string }> {
  try {
    const { gasUrl } = getGdriveConfig();
    const endpoint = (gasUrl || '').trim();

    if (!endpoint) {
      console.warn('[EMAIL] GAS Web App URL belum diatur, pengiriman email dilewati.');
      return { success: false, message: 'GAS URL belum diatur' };
    }

    const payload = {
      action: 'sendEmail',
      to: params.to.trim(),
      subject: params.subject.trim(),
      htmlBody: params.htmlBody,
      fromName: params.fromName || 'Chocochips',
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}`);
    }

    const json = await res.json().catch(() => null);
    if (json && json.success === false) {
      return { success: false, message: json.error || 'Gagal mengirim email' };
    }

    return { success: true, message: 'Email berhasil dikirim' };
  } catch (err: any) {
    console.warn('[EMAIL] Gagal mengirim email via GAS:', err?.message || err);
    return { success: false, message: err?.message || 'Koneksi ke mailer gagal' };
  }
}

/**
 * Format Header Formal Chocochips (Bukan WMS)
 */
function getChocochipsEmailHeader(title: string, subtitle: string): string {
  return `
    <div style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%); padding: 32px 24px; text-align: center; border-radius: 12px 12px 0 0; color: #ffffff;">
      <div style="letter-spacing: 4px; font-size: 24px; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
        CHOCOCHIPS
      </div>
      <div style="font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #c7d2fe; margin-bottom: 12px;">
        Official Boutique & Tailoring Care
      </div>
      <div style="height: 1px; width: 60px; background-color: #f43f5e; margin: 0 auto 12px auto;"></div>
      <div style="font-size: 16px; font-weight: 700; color: #ffffff;">
        ${title}
      </div>
      <div style="font-size: 12px; color: #e0e7ff; margin-top: 4px;">
        ${subtitle}
      </div>
    </div>
  `;
}

/**
 * Format Footer Formal Chocochips dengan Kontak Store Terkait
 */
function getChocochipsEmailFooter(order: ManualShipmentOrder): string {
  const storeName = order.nama_pengirim || 'Chocochips Official Boutique';
  const pic = order.pic_store ? ` (PIC: ${order.pic_store})` : '';
  const phone = order.no_telp_store || '-';

  return `
    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px; border-radius: 0 0 12px 12px; font-size: 12px; color: #475569; font-family: sans-serif;">
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <div style="font-weight: 700; color: #1e293b; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center;">
          📍 Kontak Store untuk Follow Up & Pertanyaan:
        </div>
        <div style="color: #334155; line-height: 1.6;">
          • <strong>Store:</strong> ${storeName}${pic}<br/>
          • <strong>Telepon / WhatsApp:</strong> <a href="https://wa.me/${phone.replace(/[^0-9]/g, '')}" style="color: #4f46e5; font-weight: 600; text-decoration: none;">${phone}</a><br/>
          Jika Kakak ingin menanyakan status pengerjaan alterasi atau pengiriman, silakan langsung menghubungi kontak store di atas.
        </div>
      </div>
      <div style="text-align: center; color: #94a3b8; font-size: 11px;">
        Email ini dikirimkan secara resmi oleh sistem layanan pelanggan Chocochips.<br/>
        © ${new Date().getFullYear()} Chocochips. All Rights Reserved.
      </div>
    </div>
  `;
}

/**
 * Format Tabel Rincian Produk Formal
 */
function getProductTableHtml(order: ManualShipmentOrder): string {
  const items = order.items || [];
  if (items.length === 0) {
    return `<div style="padding: 12px; text-align: center; color: #64748b; font-size: 12px;">Tidak ada rincian item.</div>`;
  }

  const rows = items.map((it, idx) => {
    let cleanName = it.nama_produk || '-';
    let size = it.size || '-';
    if (!size || size === '-') {
      const parts = cleanName.split('-');
      if (parts.length > 1) {
        size = parts[parts.length - 1].trim();
        cleanName = parts.slice(0, parts.length - 1).join('-').trim();
      }
    }

    const alterNote = (it.needs_alteration || it.id_form_alter || it.alteration_detail)
      ? `<div style="margin-top: 4px; padding: 4px 8px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 4px; font-size: 11px; color: #9f1239;">
          ✂️ <strong>Alterasi:</strong> ${it.alteration_detail || 'Permintaan alterasi pakaian'}
         </div>`
      : '';

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 8px; text-align: center; font-size: 12px; color: #64748b;">${idx + 1}</td>
        <td style="padding: 10px 8px; font-size: 12px; color: #1e293b; font-weight: 600;">
          ${cleanName}
          ${alterNote}
        </td>
        <td style="padding: 10px 8px; text-align: center; font-size: 12px; font-weight: 600; color: #334155;">${size}</td>
        <td style="padding: 10px 8px; font-size: 11px; font-family: monospace; color: #64748b;">${it.sku || '-'}</td>
        <td style="padding: 10px 8px; text-align: center; font-size: 12px; font-weight: 700; color: #0f172a;">${it.qty || 1}</td>
      </tr>
    `;
  }).join('');

  return `
    <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-family: sans-serif;">
      <thead>
        <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569;">
          <th style="padding: 8px; text-align: center; width: 35px;">No</th>
          <th style="padding: 8px;">Nama Produk</th>
          <th style="padding: 8px; text-align: center; width: 65px;">Size</th>
          <th style="padding: 8px; width: 120px;">SKU</th>
          <th style="padding: 8px; text-align: center; width: 45px;">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Buat Isi Email Formal untuk Customer
 */
export function buildCustomerEmailHtml(order: ManualShipmentOrder, event: EmailNotificationEvent, extraNotes?: string): { subject: string; html: string } {
  const customerName = order.nama_tujuan || 'Pelanggan Terhormat';
  const orderId = order.no_transaksi_customer || order.no_pesanan || '-';
  const storeName = order.nama_pengirim || 'Chocochips Store';

  let eventTitle = 'Informasi Pesanan Chocochips';
  let eventBadgeColor = '#3b82f6';
  let eventText = 'Pesanan Kakak sedang kami tangani.';

  if (event === 'submit') {
    eventTitle = 'Konfirmasi Penerimaan Pesanan';
    eventText = `Pesanan Kakak telah berhasil didaftarkan oleh <strong>${storeName}</strong> dan diteruskan ke tim workshop untuk persiapan.`;
  } else if (event === 'status_diterima') {
    eventTitle = 'Pesanan Diterima di Gudang / Workshop';
    eventBadgeColor = '#6366f1';
    eventText = 'Paket pakaian Kakak telah diterima dengan baik di Workshop Pusat dan siap masuk ke antrean pengerjaan.';
  } else if (event === 'status_diproses') {
    eventTitle = 'Pesanan & Alterasi Sedang Dikerjakan';
    eventBadgeColor = '#f59e0b';
    eventText = 'Pakaian Kakak saat ini sedang dalam proses pengerjaan teliti oleh tim penjahit & QC profesional kami.';
  } else if (event === 'status_dikirim') {
    eventTitle = 'Pesanan Telah Dikirimkan! 🚚';
    eventBadgeColor = '#10b981';
    eventText = `Kabar gembira! Pesanan Kakak telah selesai dikemas rapi dan diserahkan ke pihak ekspedisi <strong>${order.jasa_kirim || 'Kurir'}</strong>.`;
  } else if (event === 'status_batal') {
    eventTitle = 'Pemberitahuan Pembatalan Pesanan';
    eventBadgeColor = '#ef4444';
    eventText = `Pesanan dengan nomor <strong>${orderId}</strong> telah dibatalkan atas permintaan/kendala terkait.`;
  }

  const subject = `[Chocochips] ${eventTitle} - ${orderId}`;

  const resiBox = order.no_resi ? `
    <div style="background-color: #ecfdf5; border: 2px dashed #10b981; border-radius: 8px; padding: 14px; margin: 16px 0; text-align: center;">
      <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #065f46;">Nomor Resi Pengiriman</div>
      <div style="font-size: 20px; font-family: monospace; font-weight: 800; color: #047857; margin-top: 4px; letter-spacing: 2px;">
        ${order.no_resi}
      </div>
      <div style="font-size: 11px; color: #059669; margin-top: 4px;">
        Ekspedisi: <strong>${order.jasa_kirim || 'Kurir'}</strong>
      </div>
    </div>
  ` : '';

  const notesBox = extraNotes ? `
    <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px 14px; margin: 14px 0; font-size: 12px; color: #92400e;">
      <strong>Catatan Khusus:</strong> ${extraNotes}
    </div>
  ` : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); overflow: hidden;">
        ${getChocochipsEmailHeader(eventTitle, `Order ID: ${orderId}`)}

        <div style="padding: 24px;">
          <div style="font-size: 15px; color: #1e293b; line-height: 1.6; margin-bottom: 16px;">
            Halo Kak <strong>${customerName}</strong>,
          </div>
          <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            ${eventText}
          </p>

          ${resiBox}
          ${notesBox}

          <!-- Info Box Ringkasan -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 12px; color: #334155; line-height: 1.7;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="width: 140px; color: #64748b; font-weight: 600;">No. Pesanan:</td><td><strong>${orderId}</strong></td></tr>
              <tr><td style="color: #64748b; font-weight: 600;">Store Asal:</td><td>${storeName}</td></tr>
              <tr><td style="color: #64748b; font-weight: 600;">Alamat Kirim:</td><td>${order.alamat_tujuan || '-'}</td></tr>
              <tr><td style="color: #64748b; font-weight: 600;">Ekspedisi:</td><td>${order.jasa_kirim || '-'}</td></tr>
            </table>
          </div>

          <div style="font-size: 13px; font-weight: 700; color: #1e293b; margin-top: 20px; margin-bottom: 6px;">
            Rincian Produk & Busana:
          </div>
          ${getProductTableHtml(order)}
        </div>

        ${getChocochipsEmailFooter(order)}
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

/**
 * Buat Isi Email Notifikasi untuk PIC Store
 */
export function buildStoreEmailHtml(order: ManualShipmentOrder, event: EmailNotificationEvent, extraNotes?: string): { subject: string; html: string } {
  const storeName = order.nama_pengirim || 'Store';
  const pic = order.pic_store || 'PIC Store';
  const orderId = order.no_transaksi_customer || order.no_pesanan || '-';

  let eventTitle = 'Update Status Pesanan Manual';
  let eventText = `Terdapat pembaruan status pesanan untuk toko ${storeName}.`;

  if (event === 'submit') {
    eventTitle = 'Pesanan Baru Berhasil Didaftarkan';
    eventText = `Pesanan telah sukses dicatat di sistem dan masuk ke antrean picking & workshop gudang.`;
  } else if (event === 'status_diterima') {
    eventTitle = 'Gudang Menerima Paket Toko';
    eventText = `Fisik paket/produk dari toko telah diverifikasi dan diterima oleh admin gudang.`;
  } else if (event === 'status_diproses') {
    eventTitle = 'Pesanan / Alterasi Sedang Dikerjakan';
    eventText = `Pesanan sedang dikerjakan oleh tim penjahit & persiapan picking.`;
  } else if (event === 'status_dikirim') {
    eventTitle = 'Pesanan Telah Dikirim (Resi Terbit)';
    eventText = `Pesanan telah diserahkan ke kurir ekspedisi. Harap segera infokan No. Resi ke customer terkait.`;
  } else if (event === 'status_batal') {
    eventTitle = 'Pesanan Dibatalkan';
    eventText = `Pesanan ini telah ditandai batal. Alasan: ${extraNotes || 'Pembatalan sistem'}. Histori tetap tersimpan.`;
  }

  const subject = `[Chocochips Store Notification] ${eventTitle} - ${orderId} (${storeName})`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); overflow: hidden;">
        ${getChocochipsEmailHeader(eventTitle, `Toko: ${storeName} | PIC: ${pic}`)}

        <div style="padding: 24px;">
          <div style="font-size: 15px; color: #1e293b; line-height: 1.6; margin-bottom: 12px;">
            Halo Tim <strong>${storeName}</strong> (PIC: ${pic}),
          </div>
          <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            ${eventText}
          </p>

          ${order.no_resi ? `
            <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 12px; margin: 14px 0;">
              <span style="font-size: 11px; font-weight: 700; color: #065f46; text-transform: uppercase;">No. Resi Pengiriman:</span>
              <div style="font-size: 18px; font-family: monospace; font-weight: 800; color: #047857; margin-top: 2px;">
                ${order.no_resi} (${order.jasa_kirim || 'Kurir'})
              </div>
            </div>
          ` : ''}

          <!-- Data Customer -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 12px; color: #334155; line-height: 1.7;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="width: 130px; color: #64748b; font-weight: 600;">Customer Tujuan:</td><td><strong>${order.nama_tujuan}</strong> (${order.no_telp_tujuan})</td></tr>
              <tr><td style="color: #64748b; font-weight: 600;">Alamat Kirim:</td><td>${order.alamat_tujuan || '-'}</td></tr>
              <tr><td style="color: #64748b; font-weight: 600;">Order ID:</td><td>${orderId}</td></tr>
              ${order.notes_paket ? `<tr><td style="color: #64748b; font-weight: 600;">Notes Paket:</td><td>${order.notes_paket}</td></tr>` : ''}
            </table>
          </div>

          <div style="font-size: 13px; font-weight: 700; color: #1e293b; margin-top: 16px; margin-bottom: 6px;">
            Rincian Item:
          </div>
          ${getProductTableHtml(order)}
        </div>

        ${getChocochipsEmailFooter(order)}
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

/**
 * Dispatcher Cerdas: Kirim Notifikasi Email Otomatis ke PIC Store & Customer
 * Hanya dikirim jika alamat email dilampirkan.
 */
export async function triggerOrderEmailNotifications(
  order: ManualShipmentOrder,
  event: EmailNotificationEvent,
  extraNotes?: string
): Promise<{ storeSent: boolean; customerSent: boolean }> {
  let storeSent = false;
  let customerSent = false;

  // 1. Notifikasi ke PIC Store (jika email store dilampirkan)
  const storeEmail = (order.email_store || (order.alteration_repair_data?.pic_store_email) || '').trim();
  if (storeEmail && storeEmail.includes('@')) {
    const { subject, html } = buildStoreEmailHtml(order, event, extraNotes);
    const res = await sendEmailViaGas({
      to: storeEmail,
      subject,
      htmlBody: html,
      fromName: 'Chocochips Official Notification',
    });
    storeSent = res.success;
    if (res.success) {
      console.log(`[EMAIL] Notif terkirim ke Store PIC: ${storeEmail}`);
    }
  }

  // 2. Notifikasi ke Customer (jika email customer dilampirkan)
  const customerEmail = (order.email_customer || (order.alteration_repair_data?.email_customer) || '').trim();
  if (customerEmail && customerEmail.includes('@')) {
    const { subject, html } = buildCustomerEmailHtml(order, event, extraNotes);
    const res = await sendEmailViaGas({
      to: customerEmail,
      subject,
      htmlBody: html,
      fromName: 'Chocochips',
    });
    customerSent = res.success;
    if (res.success) {
      console.log(`[EMAIL] Notif terkirim ke Customer: ${customerEmail}`);
    }
  }

  return { storeSent, customerSent };
}
