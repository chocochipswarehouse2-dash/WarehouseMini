const fs = require('fs');
const f = 'public/pwa-extras.js';
let c = fs.readFileSync(f, 'utf8');
const crlf = c.includes('\r\n');
c = c.replace(/\r\n/g, '\n');

const oldBlock = `    data: {
      url: data.url || '/',
      page: data.page || '',
      roomId: data.roomId || '',
    },
  };

  event.waitUntil(safeShowNotification(data.title, options));
});`;

const newBlock = `    data: {
      url: data.url || '/',
      page: data.page || '',
      roomId: data.roomId || '',
      roomName: data.roomName || '',
      roomType: data.roomType || '',
      lastMessageId: data.lastMessageId || '',
    },
  };

  // Notifikasi Live Chat dari Web Push: sediakan Balas Cepat & Tandai Dibaca (seperti WhatsApp)
  if (data.chat && data.roomId) {
    options.vibrate = [200, 100, 200];
    options.actions = [
      { action: 'chat_reply', type: 'text', title: '💬 Balas Cepat', placeholder: 'Ketik balasan pesan...' },
      { action: 'chat_mark_read', title: '✓✓ Tandai Dibaca' },
    ];
  }

  event.waitUntil(
    (async () => {
      // Jika aplikasi sedang terbuka & terlihat, tab utama sudah menampilkan toast + bunyi sendiri → hindari notifikasi ganda
      try {
        const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (clientList.some((c) => c.focused && c.visibilityState === 'visible')) return;
      } catch {}
      await safeShowNotification(data.title, options);
    })()
  );
});`;

if (!c.includes(oldBlock)) {
  console.error('TARGET NOT FOUND');
  process.exit(1);
}
c = c.replace(oldBlock, newBlock);
if (crlf) c = c.replace(/\n/g, '\r\n');
fs.writeFileSync(f, c, 'utf8');
console.log('patched');
