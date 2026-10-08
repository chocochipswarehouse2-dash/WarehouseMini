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
 * Format Nama Resmi Store Chocochips:
 * "Chocochips - Nama store yang submit data"
 * Tanpa embel-embel tambahan karangan sendiri karena pesan formal.
 */
export function getFormalStoreBrandName(storeNameRaw?: string): string {
  const clean = (storeNameRaw || '').trim();
  if (!clean) return 'Chocochips';
  if (/^chocochips\s*[-–—]/i.test(clean)) {
    return clean;
  }
  if (/^chocochips/i.test(clean)) {
    const remainder = clean.replace(/^chocochips\s*/i, '').trim();
    return remainder ? `Chocochips - ${remainder}` : 'Chocochips';
  }
  return `Chocochips - ${clean}`;
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
 * KOP Resmi Chocochips:
 * "Chocochips - Nama store yang submit data"
 * "CHOCOCHIPS — Official Boutique & Tailoring Care" (Bukan WMS)
 */
function getChocochipsEmailHeader(storeName: string, title: string, subtitle: string): string {
  const brandName = getFormalStoreBrandName(storeName);

  return `
    <div style="background-color: #111827; padding: 30px 24px; text-align: center; border-radius: 8px 8px 0 0; color: #ffffff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
      <div style="letter-spacing: 2.5px; font-size: 21px; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; color: #ffffff;">
        ${brandName}
      </div>
      <div style="font-size: 11.5px; letter-spacing: 1.8px; text-transform: uppercase; color: #94a3b8; margin-bottom: 14px; font-weight: 600;">
        CHOCOCHIPS — Official Boutique & Tailoring Care
      </div>
      <div style="height: 1px; width: 48px; background-color: #e2e8f0; margin: 0 auto 14px auto;"></div>
      <div style="font-size: 15px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">
        ${title}
      </div>
      <div style="font-size: 12px; color: #cbd5e1; margin-top: 4px;">
        ${subtitle}
      </div>
    </div>
  `;
}

/**
 * Format Footer Formal Chocochips dengan Kontak Store Terkait
 */
function getChocochipsEmailFooter(order: ManualShipmentOrder): string {
  const brandName = getFormalStoreBrandName(order.nama_pengirim);
  const pic = order.pic_store ? ` (PIC: ${order.pic_store})` : '';
  const phone = order.no_telp_store || '-';

  return `
    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 22px 24px; border-radius: 0 0 8px 8px; font-size: 12px; color: #475569; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 14px;">
        <div style="font-weight: 700; color: #0f172a; font-size: 12.5px; margin-bottom: 6px;">
          📍 Kontak Store untuk Follow Up:
        </div>
        <div style="color: #334155; line-height: 1.6;">
          • <strong>Store:</strong> ${brandName}${pic}<br/>
          • <strong>Telepon / WhatsApp:</strong> <a href="https://wa.me/${phone.replace(/[^0-9]/g, '')}" style="color: #0284c7; font-weight: 600; text-decoration: none;">${phone}</a><br/>
          Jika ada pertanyaan terkait rincian pesanan maupun pengerjaan alterasi pakaian, silakan menghubungi kontak store di atas.
        </div>
      </div>
      <div style="text-align: center; color: #94a3b8; font-size: 11px; line-height: 1.5;">
        Email ini dikirimkan secara resmi oleh ${brandName}.<br/>
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
        <td style="padding: 10px 8px; font-size: 12px; color: #0f172a; font-weight: 600;">
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
export function buildCustomerEmailHtml(order: ManualShipmentOrder, event: EmailNotificationEvent, extraNotes?: string): { subject: string; html: string; fromName: string } {
  const brandName = getFormalStoreBrandName(order.nama_pengirim);
  const customerName = order.nama_tujuan || 'Pelanggan Terhormat';
  const orderId = order.no_transaksi_customer || order.no_pesanan || '-';

  let eventTitle = 'Informasi Pesanan';
  let eventText = 'Pesanan Anda sedang kami tangani.';

  if (event === 'submit') {
    eventTitle = 'Konfirmasi Penerimaan Pesanan';
    eventText = `Pesanan Anda telah berhasil didaftarkan oleh <strong>${brandName}</strong> dan diteruskan untuk persiapan.`;
  } else if (event === 'status_diterima') {
    eventTitle = 'Pesanan Diterima di Gudang';
    eventText = 'Paket pakaian Anda telah diterima dengan baik di Gudang Pusat dan siap masuk ke antrean pengerjaan.';
  } else if (event === 'status_diproses') {
    eventTitle = 'Pesanan Sedang Dikerjakan';
    eventText = 'Pakaian Anda saat ini sedang dalam proses pengerjaan oleh tim penjahit & QC kami.';
  } else if (event === 'status_dikirim') {
    eventTitle = 'Pesanan Telah Dikirimkan';
    eventText = `Pesanan Anda telah selesai dikemas rapi dan diserahkan ke pihak ekspedisi <strong>${order.jasa_kirim || 'Kurir'}</strong>.`;
  } else if (event === 'status_batal') {
    eventTitle = 'Pemberitahuan Pembatalan Pesanan';
    eventText = `Pesanan dengan nomor <strong>${orderId}</strong> telah dibatalkan.`;
  }

  const subject = `[${brandName}] ${eventTitle} - ${orderId}`;

  const resiBox = order.no_resi ? `
    <div style="background-color: #ecfdf5; border: 2px dashed #10b981; border-radius: 6px; padding: 14px; margin: 16px 0; text-align: center;">
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
      <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden;">
        ${getChocochipsEmailHeader(order.nama_pengirim, eventTitle, `No. Pesanan: ${orderId}`)}

        <div style="padding: 24px;">
          <div style="font-size: 15px; color: #0f172a; line-height: 1.6; margin-bottom: 14px;">
            Yth. <strong>${customerName}</strong>,
          </div>
          <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            ${eventText}
          </p>

          ${resiBox}
          ${notesBox}

          <!-- Info Box Ringkasan -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin: 16px 0; font-size: 12px; color: #334155; line-height: 1.7;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="width: 130px; color: #64748b; font-weight: 600;">No. Pesanan:</td><td><strong>${orderId}</strong></td></tr>
              <tr><td style="color: #64748b; font-weight: 600;">Store Asal:</td><td>${brandName}</td></tr>
              <tr><td style="color: #64748b; font-weight: 600;">Alamat Kirim:</td><td>${order.alamat_tujuan || '-'}</td></tr>
              <tr><td style="color: #64748b; font-weight: 600;">Ekspedisi:</td><td>${order.jasa_kirim || '-'}</td></tr>
            </table>
          </div>

          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 18px; margin-bottom: 6px;">
            Rincian Produk:
          </div>
          ${getProductTableHtml(order)}
        </div>

        ${getChocochipsEmailFooter(order)}
      </div>
    </body>
    </html>
  `;

  return { subject, html, fromName: brandName };
}

/**
 * Buat Isi Email Notifikasi untuk PIC Store
 */
export function buildStoreEmailHtml(order: ManualShipmentOrder, event: EmailNotificationEvent, extraNotes?: string): { subject: string; html: string; fromName: string } {
  const brandName = getFormalStoreBrandName(order.nama_pengirim);
  const pic = order.pic_store || 'PIC Store';
  const orderId = order.no_transaksi_customer || order.no_pesanan || '-';

  let eventTitle = 'Update Status Pesanan';
  let eventText = `Terdapat pembaruan status pesanan.`;

  if (event === 'submit') {
    eventTitle = 'Pesanan Baru Berhasil Didaftarkan';
    eventText = `Pesanan telah sukses dicatat di sistem dan masuk ke antrean picking & pengerjaan.`;
  } else if (event === 'status_diterima') {
    eventTitle = 'Paket Diterima di Gudang';
    eventText = `Fisik paket/produk dari toko telah diverifikasi dan diterima oleh tim gudang.`;
  } else if (event === 'status_diproses') {
    eventTitle = 'Pesanan Sedang Diproses';
    eventText = `Pesanan sedang dikerjakan oleh tim penjahit & persiapan picking.`;
  } else if (event === 'status_dikirim') {
    eventTitle = 'Pesanan Telah Dikirim (Resi Terbit)';
    eventText = `Pesanan telah diserahkan ke pihak ekspedisi. Harap segera infokan No. Resi ke customer.`;
  } else if (event === 'status_batal') {
    eventTitle = 'Pesanan Dibatalkan';
    eventText = `Pesanan ini telah ditandai batal. Alasan: ${extraNotes || 'Pembatalan sistem'}.`;
  }

  const subject = `[${brandName}] ${eventTitle} - ${orderId}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden;">
        ${getChocochipsEmailHeader(order.nama_pengirim, eventTitle, `PIC: ${pic} | No: ${orderId}`)}

        <div style="padding: 24px;">
          <div style="font-size: 15px; color: #0f172a; line-height: 1.6; margin-bottom: 12px;">
            Yth. PIC Store <strong>${pic}</strong> (${brandName}),
          </div>
          <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            ${eventText}
          </p>

          ${order.no_resi ? `
            <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 6px; padding: 12px; margin: 14px 0;">
              <span style="font-size: 11px; font-weight: 700; color: #065f46; text-transform: uppercase;">No. Resi Pengiriman:</span>
              <div style="font-size: 18px; font-family: monospace; font-weight: 800; color: #047857; margin-top: 2px;">
                ${order.no_resi} (${order.jasa_kirim || 'Kurir'})
              </div>
            </div>
          ` : ''}

          <!-- Data Customer -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin: 16px 0; font-size: 12px; color: #334155; line-height: 1.7;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="width: 130px; color: #64748b; font-weight: 600;">Customer Tujuan:</td><td><strong>${order.nama_tujuan}</strong> (${order.no_telp_tujuan})</td></tr>
              <tr><td style="color: #64748b; font-weight: 600;">Alamat Kirim:</td><td>${order.alamat_tujuan || '-'}</td></tr>
              <tr><td style="color: #64748b; font-weight: 600;">Order ID:</td><td>${orderId}</td></tr>
              ${order.notes_paket ? `<tr><td style="color: #64748b; font-weight: 600;">Notes Paket:</td><td>${order.notes_paket}</td></tr>` : ''}
            </table>
          </div>

          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 16px; margin-bottom: 6px;">
            Rincian Item:
          </div>
          ${getProductTableHtml(order)}
        </div>

        ${getChocochipsEmailFooter(order)}
      </div>
    </body>
    </html>
  `;

  return { subject, html, fromName: brandName };
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
    const { subject, html, fromName } = buildStoreEmailHtml(order, event, extraNotes);
    const res = await sendEmailViaGas({
      to: storeEmail,
      subject,
      htmlBody: html,
      fromName,
    });
    storeSent = res.success;
    if (res.success) {
      console.log(`[EMAIL] Notif terkirim ke Store PIC: ${storeEmail}`);
    }
  }

  // 2. Notifikasi ke Customer (jika email customer dilampirkan)
  const customerEmail = (order.email_customer || (order.alteration_repair_data?.email_customer) || '').trim();
  if (customerEmail && customerEmail.includes('@')) {
    const { subject, html, fromName } = buildCustomerEmailHtml(order, event, extraNotes);
    const res = await sendEmailViaGas({
      to: customerEmail,
      subject,
      htmlBody: html,
      fromName,
    });
    customerSent = res.success;
    if (res.success) {
      console.log(`[EMAIL] Notif terkirim ke Customer: ${customerEmail}`);
    }
  }

  return { storeSent, customerSent };
}
