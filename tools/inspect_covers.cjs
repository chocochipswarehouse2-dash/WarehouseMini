const https = require('https');
const TRELLO_KEY = 'd4d21774e001c525d41aabbbb9b9940a';
const TRELLO_TOKEN = 'ATTA24c8656d86fe6a0499a0e81d8c8f2f0f200ec6e7d52a9259646c1e84e03943ac56487FCC';
const BOARD_ID = 'zCN7H9VD';

const url = 'https://api.trello.com/1/boards/' + BOARD_ID + '/cards?key=' + TRELLO_KEY + '&token=' + TRELLO_TOKEN + '&attachments=true&fields=name,idList,pos,desc,badges,cover,idAttachmentCover';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const cards = JSON.parse(data);
    console.log('Total cards on board:', cards.length);
    let withCoverMismatch = 0;
    let withMultipleAttachments = 0;
    let withBelumAdaSampleAndOther = 0;

    cards.forEach(c => {
      if (!c.attachments || c.attachments.length === 0) return;
      if (c.attachments.length > 1) withMultipleAttachments++;

      const coverId = c.idAttachmentCover || c.cover?.idAttachment;
      const firstAtt = c.attachments[0];

      if (coverId && coverId !== firstAtt.id) {
        withCoverMismatch++;
      }

      const hasBelumSample = c.attachments.some(a => /BELUM.*SAMPLE/i.test(a.name));
      const hasOtherImage = c.attachments.some(a => !/BELUM.*SAMPLE/i.test(a.name) && (a.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp)/i.test(a.name)));

      if (hasBelumSample && hasOtherImage) {
        withBelumAdaSampleAndOther++;
        console.log(`[MISMATCH] Card: "${c.name}", coverId: ${coverId}, attachments: ${c.attachments.map(a => a.name).join(' | ')}`);
      }
    });

    console.log('\n--- Summary ---');
    console.log('Cards with multiple attachments:', withMultipleAttachments);
    console.log('Cards where idAttachmentCover != first attachment:', withCoverMismatch);
    console.log('Cards with "BELUM ADA SAMPLE" AND another real image:', withBelumAdaSampleAndOther);
  });
}).on('error', err => console.error(err));
