const Jimp = require('jimp');

async function processImages() {
  try {
    const image = await Jimp.read('./public/app-logo.png');
    
    // Create 192x192
    const img192 = image.clone();
    await img192.resize(192, 192).writeAsync('./public/icon-192.png');
    console.log('Created icon-192.png');
    
    // Create 512x512
    const img512 = image.clone();
    await img512.resize(512, 512).writeAsync('./public/icon-512.png');
    console.log('Created icon-512.png');
    
    // Create favicon.png (64x64)
    const favicon = image.clone();
    await favicon.resize(64, 64).writeAsync('./public/favicon.png');
    console.log('Created favicon.png');
    
  } catch (err) {
    console.error('Error processing images:', err);
  }
}

processImages();
