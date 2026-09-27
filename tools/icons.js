// App icons: draws the Riftdeck icon as SVG and renders the PNG sizes the web
// app manifest and iOS need into assets/icons/. The PNGs are committed, because
// CI has no browser to render them.
//   node tools/icons.js

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'assets/icons');

// Card outline with the game's cut corners, origin at the bottom centre (like hand cards).
const CARD = 'M-53 -210H75V-22L53 0H-75V-188Z';
// The rift: a jagged crack through the middle card, echoing the slash in the logo.
const RIFT = 'M-4 -196L9 -150L-7 -112L11 -66L-5 -30L4 -12';

/** rounded: transparent rounded corners (plain icons); false: full-bleed square (maskable, iOS). */
function iconSvg({ rounded }) {
  const bg = rounded
    ? '<rect width="512" height="512" rx="112" fill="url(#bg)"/>'
    : '<rect width="512" height="512" fill="url(#bg)"/>';
  const card = (rot, stroke, width) =>
    `<path d="${CARD}" transform="rotate(${rot})" fill="url(#face)" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="miter"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="0.62" cy="0.18" r="0.95">
      <stop offset="0" stop-color="#1d3160"/>
      <stop offset="0.62" stop-color="#06070d"/>
    </radialGradient>
    <linearGradient id="face" x1="0" y1="-210" x2="0" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1b2345"/>
      <stop offset="1" stop-color="#0b0f1f"/>
    </linearGradient>
    <filter id="glow" filterUnits="userSpaceOnUse" x="-140" y="-260" width="280" height="300">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="14"/>
    </filter>
  </defs>
  ${bg}
  <g transform="translate(256 376) scale(1.12)">
    <path d="${CARD}" transform="translate(0 10)" fill="#000" opacity="0.55" filter="url(#soft)"/>
    ${card(-18, '#b98cff', 6)}
    ${card(18, '#ff6a3d', 6)}
    <path d="${CARD}" fill="none" stroke="#36c9f0" stroke-width="16" opacity="0.5" filter="url(#glow)"/>
    ${card(0, '#36c9f0', 7)}
    <circle cx="-44" cy="-180" r="15" fill="#ffc84a"/>
    <path d="${RIFT}" fill="none" stroke="#36c9f0" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" opacity="0.95"/>
    <path d="${RIFT}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const SIZES = [
  ['icon-32.png', 32, true],
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
  ['icon-maskable-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
];

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.svg'), iconSvg({ rounded: true }) + '\n');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, rounded] of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${iconSvg({ rounded }).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`);
  await page.screenshot({ path: path.join(OUT, name), omitBackground: rounded, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`${name} ${size}x${size}`);
}
await browser.close();
