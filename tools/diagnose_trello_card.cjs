const https = require('https');
const TRELLO_KEY = 'd4d21774e001c525d41aabbbb9b9940a';
const TRELLO_TOKEN = 'ATTA24c8656d86fe6a0499a0e81d8c8f2f0f200ec6e7d52a9259646c1e84e03943ac56487FCC';
const cardId = '6a66edaf93b988922f44c7c6';

const url = 'https://api.trello.com/1/cards/' + cardId + '?attachments=true&attachment_fields=all&key=' + TRELLO_KEY + '&token=' + TRELLO_TOKEN;

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const card = JSON.parse(data);
      console.log('Card Name:', card.name);
      console.log('Card idAttachmentCover:', card.idAttachmentCover);
      console.log('Attachments count:', card.attachments ? card.attachments.length : 0);
      if (card.attachments) {
        card.attachments.forEach(att => {
          console.log({
            id: att.id,
            name: att.name,
            isUpload: att.isUpload,
            date: att.date,
            previewsCount: att.previews ? att.previews.length : 0,
            largestPreview: att.previews ? att.previews[att.previews.length - 1]?.url : null
          });
        });
      }
    } catch (e) {
      console.error('Parse error:', e);
    }
  });
}).on('error', err => console.error(err));
