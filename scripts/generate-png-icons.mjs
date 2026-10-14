import fs from 'node:fs';
import zlib from 'node:zlib';

function createSolidPNG(width, height, r, g, b, a = 255) {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8 bits per channel
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // Compression method
  ihdrData.writeUInt8(0, 11); // Filter method
  ihdrData.writeUInt8(0, 12); // Interlace method
  const ihdr = makeChunk('IHDR', ihdrData);

  // Scanlines: width * 4 + 1 (filter byte 0)
  const lineLength = width * 4 + 1;
  const rawData = Buffer.alloc(lineLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * lineLength;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      // create a nice deep blue/emerald tone with border
      const isBorder = x < 4 || x >= width - 4 || y < 4 || y >= height - 4;
      const isCenter = Math.hypot(x - width / 2, y - height / 2) < width * 0.35;
      if (isBorder) {
        rawData[pxOffset] = 217; // gold
        rawData[pxOffset + 1] = 119;
        rawData[pxOffset + 2] = 6;
        rawData[pxOffset + 3] = 255;
      } else if (isCenter) {
        rawData[pxOffset] = 16; // emerald / teal accent
        rawData[pxOffset + 1] = 185;
        rawData[pxOffset + 2] = 129;
        rawData[pxOffset + 3] = 255;
      } else {
        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
        rawData[pxOffset + 3] = a;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressedData);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Standard CRC32 implementation
function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }

  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

if (!fs.existsSync('/public')) {
  fs.mkdirSync('/public', { recursive: true });
}

fs.writeFileSync('/public/pwa-192x192.png', createSolidPNG(192, 192, 15, 23, 42));
fs.writeFileSync('/public/pwa-512x512.png', createSolidPNG(512, 512, 15, 23, 42));
fs.writeFileSync('/public/pwa-maskable-512x512.png', createSolidPNG(512, 512, 15, 23, 42));
fs.writeFileSync('/public/apple-touch-icon.png', createSolidPNG(180, 180, 15, 23, 42));
fs.writeFileSync('/public/favicon.ico', createSolidPNG(32, 32, 15, 23, 42));

console.log('Successfully generated PWA PNG icons in /public');
