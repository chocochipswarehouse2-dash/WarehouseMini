const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const publicDir = path.join(__dirname, '..', 'public');
const svg192Path = path.join(publicDir, 'icon-192.svg');
const svg512Path = path.join(publicDir, 'icon-512.svg');

function renderSvgToPng(svgContent, targetPath, size) {
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: 'width', value: size },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'sans-serif'
    }
  });
  const pngBuffer = resvg.render().asPng();
  fs.writeFileSync(targetPath, pngBuffer);
  console.log(`Generated ${path.basename(targetPath)} (${size}x${size}, ${pngBuffer.length} bytes)`);
}

function main() {
  const svg192 = fs.readFileSync(svg192Path, 'utf8');
  const svg512 = fs.readFileSync(svg512Path, 'utf8');

  // 1. icon-192.png (192x192)
  renderSvgToPng(svg192, path.join(publicDir, 'icon-192.png'), 192);

  // 2. icon-512.png (512x512)
  renderSvgToPng(svg512, path.join(publicDir, 'icon-512.png'), 512);

  // 3. apple-touch-icon.png (180x180)
  renderSvgToPng(svg192, path.join(publicDir, 'apple-touch-icon.png'), 180);

  // 4. favicon.png (48x48)
  renderSvgToPng(svg192, path.join(publicDir, 'favicon.png'), 48);

  console.log('All PWA PNG icons generated successfully!');
}

main();
