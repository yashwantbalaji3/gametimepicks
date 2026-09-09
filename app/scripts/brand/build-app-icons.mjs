/**
 * APP ICONS — generated, not hand-exported (P251 · F13).
 *
 * The site shipped no favicon, no apple-touch-icon and no web manifest, so a reader who tapped
 * "Add to Home Screen" — the closest thing to an install this product has without accounts — got
 * a screenshot thumbnail and a browser chrome window instead of the mark.
 *
 * The icons are DRAWN here rather than checked in as opaque binaries: the mark is the vault dial
 * from the brand, in the product's own tokens (--vault-scrim ground, --vault-accent emerald,
 * --vault-accent-mint centre), so a palette change regenerates rather than drifts. Pure Node —
 * zlib for the pixel data, no image dependency to install or pin.
 *
 * Usage: node scripts/brand/build-app-icons.mjs
 * Writes: app/src/app/icon.png (512) · app/src/app/apple-icon.png (180)
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Brand tokens, mirrored from app/src/app/globals.css. */
const INK = [11, 19, 16];        /* --vault-scrim ground  #0B1310 */
const RING = [52, 211, 153];     /* --vault-accent        #34D399 */
const MINT = [126, 226, 168];    /* --vault-accent-mint   #7EE2A8 */
const DEEP = [46, 160, 102];     /* --vault-accent-deep   #2EA066 */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Coverage of a disc of radius r at pixel centre (x,y), antialiased by 3×3 supersampling. */
function discCoverage(x, y, cx, cy, r) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy += 1) {
    for (let sx = 0; sx < 3; sx += 1) {
      const px = x + (sx + 0.5) / 3;
      const py = y + (sy + 0.5) / 3;
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) hits += 1;
    }
  }
  return hits / 9;
}

function ringCoverage(x, y, cx, cy, rOuter, rInner) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy += 1) {
    for (let sx = 0; sx < 3; sx += 1) {
      const px = x + (sx + 0.5) / 3;
      const py = y + (sy + 0.5) / 3;
      const d2 = (px - cx) ** 2 + (py - cy) ** 2;
      if (d2 <= rOuter * rOuter && d2 >= rInner * rInner) hits += 1;
    }
  }
  return hits / 9;
}

/** Coverage of one spoke: a radial bar of half-width w between radii r0 and r1, at angle a. */
function spokeCoverage(x, y, cx, cy, a, r0, r1, w) {
  const ca = Math.cos(a); const sa = Math.sin(a);
  let hits = 0;
  for (let sy = 0; sy < 3; sy += 1) {
    for (let sx = 0; sx < 3; sx += 1) {
      const px = x + (sx + 0.5) / 3 - cx;
      const py = y + (sy + 0.5) / 3 - cy;
      const along = px * ca + py * sa;
      const across = -px * sa + py * ca;
      if (along >= r0 && along <= r1 && Math.abs(across) <= w) hits += 1;
    }
  }
  return hits / 9;
}

const over = (dst, i, rgb, a) => {
  if (a <= 0) return;
  dst[i] = Math.round(dst[i] * (1 - a) + rgb[0] * a);
  dst[i + 1] = Math.round(dst[i + 1] * (1 - a) + rgb[1] * a);
  dst[i + 2] = Math.round(dst[i + 2] * (1 - a) + rgb[2] * a);
  dst[i + 3] = 255;
};

/**
 * The vault dial. Proportions are held in fractions of the canvas so 180px and 512px are the same
 * drawing — the mark has to survive being a 16px browser tab, so nothing is thinner than ~3% of
 * the width and there is no text.
 */
function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const R = size * 0.40;   // outer ring, outer edge
  const Ri = size * 0.335; // outer ring, inner edge
  const HUB = size * 0.125;
  const CENTRE = size * 0.055;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      /* Ground: a flat vault ink, full-bleed so the icon is safe as a maskable. */
      rgba[i] = INK[0]; rgba[i + 1] = INK[1]; rgba[i + 2] = INK[2]; rgba[i + 3] = 255;
      /* A faint deep-green wash from the top-left, the same light the app's surfaces use. */
      const wash = Math.max(0, 1 - Math.hypot(x - size * 0.18, y - size * 0.14) / (size * 0.9)) * 0.30;
      over(rgba, i, DEEP, wash);
      /* Eight spokes, then the ring over them, then the hub — draw order is the depth order. */
      for (let k = 0; k < 8; k += 1) {
        const a = (Math.PI / 4) * k + Math.PI / 8;
        over(rgba, i, DEEP, spokeCoverage(x, y, c, c, a, HUB * 0.7, R * 0.99, size * 0.030));
      }
      over(rgba, i, RING, ringCoverage(x, y, c, c, R, Ri));
      over(rgba, i, RING, discCoverage(x, y, c, c, HUB));
      over(rgba, i, INK, discCoverage(x, y, c, c, HUB * 0.62));
      over(rgba, i, MINT, discCoverage(x, y, c, c, CENTRE));
    }
  }
  return encodePng(size, rgba);
}

const targets = [
  ["src/app/icon.png", 512],
  ["src/app/apple-icon.png", 180],
];
for (const [rel, size] of targets) {
  const buf = drawIcon(size);
  fs.writeFileSync(path.join(APP, rel), buf);
  console.log(`wrote ${rel}  ${size}×${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
