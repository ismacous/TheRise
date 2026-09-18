// Generates the launcher PNGs for pre-Android-8 devices and the store listing.
// Written with zlib only so the repo needs no image toolchain in CI.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const BG = hex('#1C1814');
const ROOF = hex('#B5543C');
const WALL = hex('#E4DAC4');
const DOOR = hex('#6B4A2C');
const TOWER = hex('#9AA0A6');
const GOLD = hex('#D9B45F');

/** Signed distance helpers, evaluated in a 0..108 design space. */
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

const inRect = (px, py, x0, y0, x1, y1) => px >= x0 && px < x1 && py >= y0 && py < y1;

function shade(px, py, rounded) {
  // Rounded-square background, matching the adaptive icon's mask.
  if (rounded) {
    const r = 24;
    const cx = Math.min(Math.max(px, r), 108 - r);
    const cy = Math.min(Math.max(py, r), 108 - r);
    if ((px - cx) ** 2 + (py - cy) ** 2 > r * r) return null;
  }
  if (inRect(px, py, 22, 80, 86, 85)) return GOLD;
  if (inTriangle(px, py, 70, 28, 79, 40, 61, 40)) return GOLD;
  if (inRect(px, py, 64, 40, 77, 80)) return TOWER;
  if (inRect(px, py, 49, 62, 59, 80)) return DOOR;
  if (inRect(px, py, 31, 52, 77, 80)) return WALL;
  if (inTriangle(px, py, 54, 26, 82, 52, 26, 52)) return ROOF;
  return BG;
}

/** Renders the icon at `size` px with 3x3 supersampling. */
function render(size, rounded) {
  const rgba = Buffer.alloc(size * size * 4);
  const S = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = ((x + (sx + 0.5) / S) / size) * 108;
          const py = ((y + (sy + 0.5) / S) / size) * 108;
          const c = shade(px, py, rounded);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }
      const n = S * S;
      const i = (y * size + x) * 4;
      const alpha = a / n;
      // Premultiplied averaging would darken edges, so normalise by coverage.
      const cover = a === 0 ? 1 : a / 255;
      rgba[i] = Math.round(r / cover);
      rgba[i + 1] = Math.round(g / cover);
      rgba[i + 2] = Math.round(b / cover);
      rgba[i + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, size, rgba);
}

const root = resolve(process.argv[2] ?? 'android/app/src/main/res');
const densities = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

for (const [density, size] of densities) {
  for (const [name, rounded] of [
    ['ic_launcher.png', false],
    ['ic_launcher_round.png', true],
    ['ic_launcher_foreground.png', false],
  ]) {
    const path = `${root}/mipmap-${density}/${name}`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, render(size, rounded));
  }
}

// A 512px icon for the Play Store listing.
mkdirSync('store', { recursive: true });
writeFileSync('store/icon-512.png', render(512, false));

console.log('Icons written.');
