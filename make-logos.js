const fs = require('fs');
const { execSync } = require('child_process');

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#111111" rx="100"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="160" font-weight="bold" font-family="sans-serif" fill="#ffffff" letter-spacing="4">WMS</text>
</svg>`;

const appLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 128" width="512" height="128">
  <rect x="16" y="16" width="96" height="96" fill="#111111" rx="24"/>
  <text x="64" y="64" dominant-baseline="central" text-anchor="middle" font-size="32" font-weight="bold" font-family="sans-serif" fill="#ffffff" letter-spacing="1">WMS</text>
  <text x="136" y="64" dominant-baseline="central" text-anchor="start" font-size="48" font-weight="bold" font-family="sans-serif" fill="#111111" letter-spacing="1">Warehouse Mini</text>
</svg>`;

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 128" width="512" height="128">
  <rect x="0" y="16" width="96" height="96" fill="#111111" rx="24"/>
  <text x="48" y="64" dominant-baseline="central" text-anchor="middle" font-size="32" font-weight="bold" font-family="sans-serif" fill="#ffffff" letter-spacing="1">WMS</text>
  <text x="112" y="64" dominant-baseline="central" text-anchor="start" font-size="48" font-weight="bold" font-family="sans-serif" fill="#111111" letter-spacing="1">Warehouse</text>
</svg>`;

fs.writeFileSync('public/icon-512.svg', iconSvg);
fs.writeFileSync('public/app-logo.svg', appLogoSvg);
fs.writeFileSync('public/logo.svg', logoSvg);
