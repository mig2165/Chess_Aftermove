import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = path.join(root, "icons");

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Precompute CRC table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xFF];
  }
  return (c ^ (-1)) >>> 0;
}

function createPng(width, height, rgbaBuffer) {
  // Signature
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // No interlace

  const ihdrChunk = createChunk("IHDR", ihdrData);

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (1 + width * 4);
    scanlines[scanlineOffset] = 0; // No filter
    rgbaBuffer.copy(scanlines, scanlineOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = createChunk("IDAT", compressed);
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

// Draw Aftermove icon:
// Rounded square with deep charcoal/navy background (#0f172a),
// vibrant chartreuse border and inner emblem (#d8f36a).
function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    // Blend with existing
    const existingA = rgba[idx + 3] / 255;
    const currentA = a / 255;
    const outA = currentA + existingA * (1 - currentA);
    if (outA === 0) return;
    rgba[idx] = Math.round((r * currentA + rgba[idx] * existingA * (1 - currentA)) / outA);
    rgba[idx + 1] = Math.round((g * currentA + rgba[idx + 1] * existingA * (1 - currentA)) / outA);
    rgba[idx + 2] = Math.round((b * currentA + rgba[idx + 2] * existingA * (1 - currentA)) / outA);
    rgba[idx + 3] = Math.round(outA * 255);
  }

  const radius = Math.max(2, Math.round(size * 0.22));
  const chartreuse = [216, 243, 106]; // #d8f36a
  const darkBg = [15, 23, 42];        // #0f172a
  const borderCol = [34, 197, 94];    // #22c55e (subtle green accent)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Check rounded rect distance
      const dx = Math.max(0, Math.max(radius - x, x - (size - 1 - radius)));
      const dy = Math.max(0, Math.max(radius - y, y - (size - 1 - radius)));
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Inside rounded rect
        const edgeDist = radius - dist;
        const alpha = Math.min(1, edgeDist + 0.5);

        // Border check (1-2px border)
        const isBorder = (x < 1 || x >= size - 1 || y < 1 || y >= size - 1 || (dist >= radius - 1.2));
        if (isBorder && size >= 32) {
          setPixel(x, y, borderCol[0], borderCol[1], borderCol[2], Math.round(alpha * 255));
        } else {
          setPixel(x, y, darkBg[0], darkBg[1], darkBg[2], Math.round(alpha * 255));
        }
      }
    }
  }

  // Draw Letter "A" or Chess Knight shape in center
  // Simple geometric stylized "A" with crossbar in chartreuse
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const h = size * 0.58;
  const topY = cy - h / 2;
  const bottomY = cy + h / 2;
  const halfBase = h * 0.38;

  const strokeWidth = Math.max(1.2, size * 0.12);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (y >= topY && y <= bottomY) {
        const progress = (y - topY) / (bottomY - topY);
        const leftLegX = cx - progress * halfBase;
        const rightLegX = cx + progress * halfBase;

        // Distance to left leg
        const dLeft = Math.abs(x - leftLegX);
        // Distance to right leg
        const dRight = Math.abs(x - rightLegX);
        // Crossbar
        const isBar = (progress >= 0.52 && progress <= 0.68 && x >= leftLegX && x <= rightLegX);

        if (dLeft < strokeWidth || dRight < strokeWidth || isBar) {
          const legDist = Math.min(dLeft, dRight);
          const barDist = isBar ? 0 : legDist;
          const distToA = Math.min(legDist, barDist);
          if (distToA < strokeWidth) {
            const intensity = Math.max(0, Math.min(1, (strokeWidth - distToA) / 0.8));
            setPixel(x, y, chartreuse[0], chartreuse[1], chartreuse[2], Math.round(intensity * 255));
          }
        }
      }
    }
  }

  return createPng(size, size, rgba);
}

for (const size of [16, 32, 48, 128]) {
  const png = drawIcon(size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}

