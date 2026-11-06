// アプリのアイコン（PNG）を作る：紺の背景に、白い野球ボールと赤い縫い目
// 使い方： npx tsx tools/make-icons.ts （public/icons に書き出す）
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const NAVY: [number, number, number] = [11, 61, 145];
const WHITE: [number, number, number] = [250, 250, 246];
const RED: [number, number, number] = [200, 16, 46];
const mix = (a: number[], b: number[], t: number): [number, number, number] => [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)) as [number, number, number];

/** 1ピクセルの色（4×4で平均して輪郭をなめらかに） */
function draw(size: number) {
  const c = size / 2;
  const R = size * 0.36; // ボールの半径
  const sample = (px: number, py: number): [number, number, number] => {
    const dx = px - c;
    const dy = py - c;
    const d = Math.hypot(dx, dy);
    if (d > R) return NAVY;
    // 縫い目：左右から内側にふくらむ2本の弧
    const seamR = R * 0.95;
    const off = R * 1.25;
    const seam = (cx: number) => Math.abs(Math.hypot(px - cx, py - c) - seamR);
    const w = size * 0.018;
    if (seam(c - off) < w || seam(c + off) < w) return RED;
    // 縫い目の糸（短い斜線）
    for (const side of [-1, 1]) {
      const cx = c + side * off;
      const ang = Math.atan2(py - c, px - cx);
      const rr = Math.hypot(px - cx, py - c);
      const step = 0.13;
      const k = Math.round(ang / step) * step;
      if (Math.abs(ang - k) < 0.025 && Math.abs(rr - seamR) < size * 0.05 && Math.abs(rr - seamR) > w) return RED;
    }
    // 少し影をつける
    const shade = Math.max(0, (dx + dy) / (2 * R)) * 0.12;
    return mix(WHITE, [180, 180, 175], shade);
  };
  return (x: number, y: number): [number, number, number] => {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const [a, bb, cc] = sample(x + (i + 0.5) / 4, y + (j + 0.5) / 4);
      r += a; g += bb; b += cc;
    }
    return [Math.round(r / 16), Math.round(g / 16), Math.round(b / 16)];
  };
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
  writeFileSync(`public/icons/${name}`, png(size, draw(size)));
  console.log('書き出し', name);
}
