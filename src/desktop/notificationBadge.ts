import { deflateSync } from 'node:zlib';

const WIDTH = 32;
const HEIGHT = 32;
type Color = readonly [number, number, number, number];

const WHITE: Color = [248, 250, 252, 255];
const BLUE: Color = [72, 151, 235, 255];
const RED: Color = [224, 65, 77, 255];
const DIGITS: Record<string, readonly string[]> = {
  '1': ['010', '110', '010', '010', '111'],
  '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '110', '101', '010'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['010', '101', '010', '101', '010'],
  '9': ['010', '101', '011', '001', '110'],
};

function setPixel(pixels: Buffer, x: number, y: number, color: Color): void {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const index = (y * WIDTH + x) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3];
}

function circle(pixels: Buffer, centerX: number, centerY: number, radius: number, color: Color): void {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= radius * radius) setPixel(pixels, x, y, color);
    }
  }
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function notificationBadgePng(unreadCount: number): Buffer {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  circle(pixels, 14, 17, 12, BLUE);
  // A small compass mark keeps the badge recognizable as Wayfinder in the tray.
  setPixel(pixels, 14, 7, WHITE);
  setPixel(pixels, 13, 8, WHITE);
  setPixel(pixels, 14, 8, WHITE);
  setPixel(pixels, 15, 8, WHITE);
  setPixel(pixels, 12, 9, WHITE);
  setPixel(pixels, 14, 9, WHITE);
  setPixel(pixels, 16, 9, WHITE);
  setPixel(pixels, 11, 10, WHITE);
  setPixel(pixels, 14, 10, WHITE);
  setPixel(pixels, 17, 10, WHITE);
  setPixel(pixels, 12, 11, WHITE);
  setPixel(pixels, 14, 11, WHITE);
  setPixel(pixels, 16, 11, WHITE);
  setPixel(pixels, 13, 12, WHITE);
  setPixel(pixels, 14, 12, WHITE);
  setPixel(pixels, 15, 12, WHITE);

  circle(pixels, 25, 7, 7, [13, 18, 27, 255]);
  circle(pixels, 25, 7, 6, RED);
  const digit = String(Math.min(Math.max(1, Math.floor(unreadCount)), 9));
  const glyph = DIGITS[digit] ?? DIGITS['1']!;
  for (const [row, line] of glyph.entries()) {
    for (const [column, value] of Array.from(line).entries()) {
      if (value === '1') setPixel(pixels, 24 + column, 5 + row, WHITE);
    }
  }

  const scanlines = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) pixels.copy(scanlines, y * (WIDTH * 4 + 1) + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(scanlines)), pngChunk('IEND', Buffer.alloc(0))]);
}
