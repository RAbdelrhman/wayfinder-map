import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.generated');
const source = await readFile(join(root, 'assets', 'wayfinder-icon.svg'));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map((size) => sharp(source).resize(size, size).png().toBuffer()));

await mkdir(output, { recursive: true });
await writeFile(join(output, 'Wayfinder.png'), images.at(-1));

const directorySize = 6 + images.length * 16;
const header = Buffer.alloc(directorySize);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);

let offset = directorySize;
for (const [index, image] of images.entries()) {
  const size = sizes[index] ?? 256;
  const entry = 6 + index * 16;
  header.writeUInt8(size === 256 ? 0 : size, entry);
  header.writeUInt8(size === 256 ? 0 : size, entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
}

await writeFile(join(output, 'Wayfinder.ico'), Buffer.concat([header, ...images]));
process.stdout.write('created .generated/Wayfinder.ico\n');
