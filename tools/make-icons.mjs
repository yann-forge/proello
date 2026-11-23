// Génère les icônes PNG et SVG de l'app (aucune dépendance) : `node tools/make-icons.mjs`
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const C = { bg: '#FFF4D6', orange: '#FFB98A', green: '#A9DCB2', yellow: '#FFDB7A', sand: '#E9DFCC', check: '#FFFFFF' };

// Dessin dans un repère 512×512
function shapes(maskable) {
  const s = maskable ? 0.78 : 1; // marge de sécurité pour les icônes adaptatives
  const t = (v) => 256 + (v - 256) * s;
  const tile = (x, y, color) => ({ kind: 'rect', x: t(x), y: t(y), w: 148 * s, h: 148 * s, r: 38 * s, color });
  return [
    maskable ? { kind: 'rect', x: 0, y: 0, w: 512, h: 512, r: 0, color: C.bg } : { kind: 'rect', x: 0, y: 0, w: 512, h: 512, r: 116, color: C.bg },
    tile(96, 96, C.orange),
    tile(268, 96, C.green),
    tile(96, 268, C.yellow),
    tile(268, 268, C.sand),
    { kind: 'line', pts: [[t(131), t(172)], [t(160), t(201)], [t(210), t(140)]], w: 22 * s, color: C.check },
  ];
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function inRect(px, py, { x, y, w, h, r }) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const dx = Math.max(x + r - px, 0, px - (x + w - r));
  const dy = Math.max(y + r - py, 0, py - (y + h - r));
  return dx * dx + dy * dy <= r * r;
}
function segDist(px, py, [ax, ay], [bx, by]) {
  const vx = bx - ax, vy = by - ay;
  const k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + k * vx), py - (ay + k * vy));
}
function inLine(px, py, { pts, w }) {
  for (let i = 0; i < pts.length - 1; i++) if (segDist(px, py, pts[i], pts[i + 1]) <= w / 2) return true;
  return false;
}

function render(size, maskable) {
  const list = shapes(maskable).map((sh) => ({ ...sh, rgb: hex(sh.color) }));
  const N = 4; // suréchantillonnage 4×4
  const scale = 512 / size;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const X = (x + (sx + 0.5) / N) * scale;
          const Y = (y + (sy + 0.5) / N) * scale;
          let col = null;
          for (const sh of list) if (sh.kind === 'rect' ? inRect(X, Y, sh) : inLine(X, Y, sh)) col = sh.rgb;
          if (col) { r += col[0]; g += col[1]; b += col[2]; a += 1; }
        }
      }
      const i = (y * size + x) * 4;
      if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
      px[i + 3] = Math.round((a / (N * N)) * 255);
    }
  }
  return png(size, px);
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function svg() {
  const body = shapes(false)
    .map((sh) =>
      sh.kind === 'rect'
        ? `<rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}" rx="${sh.r}" fill="${sh.color}"/>`
        : `<polyline points="${sh.pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${sh.color}" stroke-width="${sh.w}" stroke-linecap="round" stroke-linejoin="round"/>`
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>\n`;
}

writeFileSync(new URL('icon.svg', OUT), svg());
writeFileSync(new URL('icon-192.png', OUT), render(192, false));
writeFileSync(new URL('icon-512.png', OUT), render(512, false));
writeFileSync(new URL('icon-maskable-512.png', OUT), render(512, true));
writeFileSync(new URL('apple-touch-icon.png', OUT), render(180, true));
console.log('Icônes générées dans icons/');
