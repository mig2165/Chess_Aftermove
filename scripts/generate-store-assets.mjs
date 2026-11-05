import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(root, "store-assets");

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
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
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrChunk = createChunk("IHDR", ihdrData);

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (1 + width * 4);
    scanlines[scanlineOffset] = 0;
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

class ImageBuffer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.buffer = Buffer.alloc(width * height * 4);
  }

  setPixel(x, y, r, g, b, a = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    const curA = a / 255;
    const bgA = this.buffer[idx + 3] / 255;
    const outA = curA + bgA * (1 - curA);
    if (outA === 0) return;
    this.buffer[idx] = Math.round((r * curA + this.buffer[idx] * bgA * (1 - curA)) / outA);
    this.buffer[idx + 1] = Math.round((g * curA + this.buffer[idx + 1] * bgA * (1 - curA)) / outA);
    this.buffer[idx + 2] = Math.round((b * curA + this.buffer[idx + 2] * bgA * (1 - curA)) / outA);
    this.buffer[idx + 3] = Math.round(outA * 255);
  }

  fillRect(x1, y1, w, h, [r, g, b, a = 255]) {
    for (let y = y1; y < y1 + h; y++) {
      for (let x = x1; x < x1 + w; x++) {
        this.setPixel(x, y, r, g, b, a);
      }
    }
  }

  fillRoundedRect(x1, y1, w, h, radius, [r, g, b, a = 255]) {
    for (let y = y1; y < y1 + h; y++) {
      for (let x = x1; x < x1 + w; x++) {
        const dx = Math.max(0, Math.max(x1 + radius - x, x - (x1 + w - 1 - radius)));
        const dy = Math.max(0, Math.max(y1 + radius - y, y - (y1 + h - 1 - radius)));
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          const edge = radius - dist;
          const alpha = Math.min(1, edge + 0.5) * (a / 255) * 255;
          this.setPixel(x, y, r, g, b, alpha);
        }
      }
    }
  }

  drawBorder(x1, y1, w, h, radius, borderWidth, [r, g, b, a = 255]) {
    for (let y = y1; y < y1 + h; y++) {
      for (let x = x1; x < x1 + w; x++) {
        const dx = Math.max(0, Math.max(x1 + radius - x, x - (x1 + w - 1 - radius)));
        const dy = Math.max(0, Math.max(y1 + radius - y, y - (y1 + h - 1 - radius)));
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius && dist >= radius - borderWidth) {
          this.setPixel(x, y, r, g, b, a);
        }
      }
    }
  }

  drawLine(x1, y1, x2, y2, thickness, [r, g, b, a = 255]) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const steps = Math.ceil(len * 2);
    const halfThick = thickness / 2;
    for (let i = 0; i <= steps; i++) {
      const cx = x1 + (dx * i) / steps;
      const cy = y1 + (dy * i) / steps;
      for (let ty = cy - halfThick; ty <= cy + halfThick; ty++) {
        for (let tx = cx - halfThick; tx <= cx + halfThick; tx++) {
          this.setPixel(tx, ty, r, g, b, a);
        }
      }
    }
  }

  toPng() {
    return createPng(this.width, this.height, this.buffer);
  }
}

// 1. Generate Promo Tile: 440x280 px
function generatePromoTile() {
  const img = new ImageBuffer(440, 280);
  const darkBg = [16, 23, 25];       // #101719
  const accent = [216, 243, 106];    // #d8f36a
  const muted = [168, 181, 174];     // #a8b5ae
  const borderCol = [52, 65, 61];    // #34413d

  for (let y = 0; y < 280; y++) {
    for (let x = 0; x < 440; x++) {
      const distFromCorner = Math.sqrt(Math.pow(440 - x, 2) + Math.pow(y, 2));
      const glow = Math.max(0, 1 - distFromCorner / 350) * 0.12;
      const r = Math.round(darkBg[0] * (1 - glow) + accent[0] * glow);
      const g = Math.round(darkBg[1] * (1 - glow) + accent[1] * glow);
      const b = Math.round(darkBg[2] * (1 - glow) + accent[2] * glow);
      img.setPixel(x, y, r, g, b, 255);
    }
  }

  img.drawBorder(0, 0, 440, 280, 0, 1, borderCol);

  // Logo Badge "A"
  const bx = 45;
  const by = 48;
  const bw = 54;
  const bh = 54;
  img.fillRoundedRect(bx, by, bw, bh, 12, [22, 34, 28]);
  img.drawBorder(bx, by, bw, bh, 12, 1.5, accent);

  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const h = 32;
  const topY = cy - h / 2;
  const bottomY = cy + h / 2;
  const halfBase = h * 0.38;
  const strokeWidth = 3;

  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      if (y >= topY && y <= bottomY) {
        const prog = (y - topY) / (bottomY - topY);
        const lX = cx - prog * halfBase;
        const rX = cx + prog * halfBase;
        const isBar = (prog >= 0.52 && prog <= 0.68 && x >= lX && x <= rX);
        const dL = Math.abs(x - lX);
        const dR = Math.abs(x - rX);
        if (Math.min(dL, dR) < strokeWidth || isBar) {
          img.setPixel(x, y, accent[0], accent[1], accent[2], 255);
        }
      }
    }
  }

  // Text bars
  img.fillRoundedRect(114, 52, 180, 20, 3, [243, 245, 239]);
  img.fillRoundedRect(114, 78, 120, 12, 2, accent);
  img.fillRoundedRect(45, 125, 290, 14, 3, [218, 226, 222]);
  img.fillRoundedRect(45, 146, 210, 11, 2, muted);

  const pills = [
    { x: 45, y: 195, w: 105 },
    { x: 158, y: 195, w: 115 },
    { x: 281, y: 195, w: 110 }
  ];

  for (const pill of pills) {
    img.fillRoundedRect(pill.x, pill.y, pill.w, 32, 6, [25, 36, 32]);
    img.drawBorder(pill.x, pill.y, pill.w, 32, 6, 1, [48, 68, 58]);
    img.fillRoundedRect(pill.x + 12, pill.y + 11, pill.w - 24, 10, 2, accent);
  }

  img.fillRect(0, 276, 440, 4, accent);
  return img.toPng();
}

// 2. Generate Store Screenshot 1 (Review Board with Best Move Arrow): 1280x800 px
function generateReviewScreenshot() {
  const img = new ImageBuffer(1280, 800);
  const darkBg = [16, 23, 25];
  const accent = [216, 243, 106];
  const green = [34, 197, 94];
  const line = [52, 65, 61];
  const lightSq = [212, 217, 200];
  const darkSq = [113, 136, 118];

  img.fillRect(0, 0, 1280, 800, darkBg);

  // Header Bar
  img.fillRect(0, 0, 1280, 70, [18, 26, 28]);
  img.fillRect(0, 69, 1280, 1, line);
  img.fillRoundedRect(60, 18, 34, 34, 7, [22, 34, 28]);
  img.drawBorder(60, 18, 34, 34, 7, 1.2, accent);
  img.fillRoundedRect(105, 27, 130, 16, 3, [243, 245, 239]);
  img.fillRoundedRect(1100, 25, 120, 22, 11, [24, 35, 31]);
  img.drawBorder(1100, 25, 120, 22, 11, 1, line);
  img.fillRoundedRect(1112, 33, 6, 6, 3, accent);
  img.fillRoundedRect(1124, 31, 80, 10, 2, [168, 181, 174]);

  // Match Header Banner
  img.fillRoundedRect(60, 95, 1160, 72, 8, [22, 34, 29]);
  img.drawBorder(60, 95, 1160, 72, 8, 1, [42, 58, 51]);

  // White Player
  img.fillRoundedRect(80, 109, 44, 44, 6, [243, 245, 239]);
  img.fillRoundedRect(136, 115, 150, 16, 3, [243, 245, 239]);
  img.fillRoundedRect(136, 136, 60, 11, 2, [168, 181, 174]);
  img.fillRoundedRect(320, 107, 75, 48, 6, [32, 48, 36]);
  img.drawBorder(320, 107, 75, 48, 6, 1, accent);
  img.fillRoundedRect(332, 115, 50, 18, 3, accent);
  img.fillRoundedRect(335, 137, 45, 8, 1, [168, 181, 174]);

  // Result Badge
  img.fillRoundedRect(570, 115, 140, 32, 16, [32, 48, 36]);
  img.drawBorder(570, 115, 140, 32, 16, 1, accent);
  img.fillRoundedRect(588, 125, 104, 12, 2, accent);

  // Black Player
  img.fillRoundedRect(885, 107, 75, 48, 6, [28, 45, 43]);
  img.drawBorder(885, 107, 75, 48, 6, 1, [131, 220, 218]);
  img.fillRoundedRect(897, 115, 50, 18, 3, [131, 220, 218]);
  img.fillRoundedRect(900, 137, 45, 8, 1, [168, 181, 174]);
  img.fillRoundedRect(990, 115, 150, 16, 3, [243, 245, 239]);
  img.fillRoundedRect(1080, 136, 60, 11, 2, [168, 181, 174]);
  img.fillRoundedRect(1156, 109, 44, 44, 6, [28, 38, 33]);

  // Left Column: Chessboard
  const boardX = 60;
  const boardY = 195;
  const boardSize = 512;
  const sqSize = boardSize / 8;

  img.drawBorder(boardX - 1, boardY - 1, boardSize + 2, boardSize + 2, 4, 1, [100, 117, 106]);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const isDark = (r + c) % 2 === 1;
      img.fillRect(boardX + c * sqSize, boardY + r * sqSize, sqSize, sqSize, isDark ? darkSq : lightSq);
    }
  }

  // Highlight Last Move
  img.fillRect(boardX + 4 * sqSize, boardY + 4 * sqSize, sqSize, sqSize, [216, 243, 106, 130]);
  img.fillRect(boardX + 4 * sqSize, boardY + 6 * sqSize, sqSize, sqSize, [216, 243, 106, 90]);

  // Best Move Arrow
  const aX1 = boardX + 3.5 * sqSize;
  const aY1 = boardY + 4.5 * sqSize;
  const aX2 = boardX + 5.5 * sqSize;
  const aY2 = boardY + 2.5 * sqSize;
  img.drawLine(aX1, aY1, aX2, aY2, 7, green);
  img.fillRoundedRect(aX2 - 10, aY2 - 10, 20, 20, 10, green);
  img.fillRoundedRect(aX2 - 4, aY2 - 4, 8, 8, 4, [16, 23, 25]);

  // Board navigation controls
  img.fillRoundedRect(boardX, 720, 85, 34, 4, [37, 28, 24]);
  img.drawBorder(boardX, 720, 85, 34, 4, 1, [90, 66, 55]);
  img.fillRoundedRect(boardX + 95, 720, 42, 34, 4, [32, 43, 38]);
  img.fillRoundedRect(boardX + 145, 728, 220, 18, 3, [210, 220, 212]);
  img.fillRoundedRect(boardX + 375, 720, 42, 34, 4, [32, 43, 38]);
  img.fillRoundedRect(boardX + 427, 720, 85, 34, 4, [37, 28, 24]);
  img.drawBorder(boardX + 427, 720, 85, 34, 4, 1, [90, 66, 55]);

  // Right Column
  const rightX = 610;

  // Advantage Panel
  img.fillRoundedRect(rightX, 195, 610, 78, 6, [23, 32, 29]);
  img.drawBorder(rightX, 195, 610, 78, 6, 1, [71, 85, 77]);
  img.fillRoundedRect(rightX + 16, 207, 140, 14, 2, [231, 236, 229]);
  img.fillRoundedRect(rightX + 510, 205, 80, 18, 3, accent);
  img.fillRoundedRect(rightX + 16, 235, 578, 14, 3, [113, 136, 118]);
  img.fillRoundedRect(rightX + 16, 235, 420, 14, 3, [245, 246, 239]);
  img.fillRect(rightX + 16 + 289, 235, 2, 14, [16, 23, 25]);

  // Best Continuation Card
  img.fillRoundedRect(rightX, 288, 610, 140, 8, [18, 28, 23]);
  img.drawBorder(rightX, 288, 610, 140, 8, 1, [34, 197, 94, 90]);
  img.fillRoundedRect(rightX + 16, 302, 140, 18, 4, [34, 197, 94, 50]);
  img.fillRoundedRect(rightX + 24, 306, 124, 10, 2, green);
  img.fillRoundedRect(rightX + 170, 306, 90, 10, 2, [168, 181, 174]);

  img.fillRoundedRect(rightX + 16, 335, 120, 34, 6, [34, 197, 94, 40]);
  img.drawBorder(rightX + 16, 335, 120, 34, 6, 1.2, green);
  img.fillRoundedRect(rightX + 30, 345, 90, 14, 2, [243, 245, 239]);

  img.fillRoundedRect(rightX + 148, 335, 120, 34, 6, [24, 35, 30]);
  img.drawBorder(rightX + 148, 335, 120, 34, 6, 1, line);
  img.fillRoundedRect(rightX + 162, 345, 90, 14, 2, [168, 181, 174]);

  img.fillRoundedRect(rightX + 280, 335, 120, 34, 6, [24, 35, 30]);
  img.drawBorder(rightX + 280, 335, 120, 34, 6, 1, line);
  img.fillRoundedRect(rightX + 294, 345, 90, 14, 2, [168, 181, 174]);

  img.fillRoundedRect(rightX + 16, 384, 180, 32, 6, [34, 197, 94]);
  img.fillRoundedRect(rightX + 210, 384, 180, 32, 6, [25, 36, 31]);
  img.drawBorder(rightX + 210, 384, 180, 32, 6, 1, line);

  // Move Classification Table
  img.fillRoundedRect(rightX, 442, 610, 310, 8, [20, 28, 25]);
  img.drawBorder(rightX, 442, 610, 310, 8, 1, [43, 55, 50]);
  img.fillRect(rightX, 475, 610, 1, line);
  img.fillRoundedRect(rightX + 20, 454, 140, 12, 2, accent);
  img.fillRoundedRect(rightX + 250, 454, 110, 12, 2, [168, 181, 174]);
  img.fillRoundedRect(rightX + 470, 454, 120, 12, 2, [131, 220, 218]);

  const cats = [
    { label: "Best", col: accent, y: 488 },
    { label: "Great", col: [134, 239, 172], y: 524 },
    { label: "Good", col: [155, 181, 165], y: 560 },
    { label: "Inaccuracy", col: [246, 224, 118], y: 596 },
    { label: "Mistake", col: [255, 191, 128], y: 632 },
    { label: "Blunder", col: [255, 155, 138], y: 668 }
  ];

  for (const c of cats) {
    img.fillRect(rightX + 15, c.y + 26, 580, 1, [28, 38, 33]);
    img.fillRoundedRect(rightX + 35, c.y + 4, 30, 14, 2, [243, 245, 239]);
    img.fillRoundedRect(rightX + 265, c.y + 2, 80, 18, 3, c.col);
    img.fillRoundedRect(rightX + 540, c.y + 4, 30, 14, 2, [243, 245, 239]);
  }

  return img.toPng();
}

// 3. Generate Store Screenshot 2 (Side-by-side Move Breakdown & Coach Notes): 1280x800 px
function generateBreakdownScreenshot() {
  const img = new ImageBuffer(1280, 800);
  const darkBg = [16, 23, 25];
  const accent = [216, 243, 106];
  const line = [52, 65, 61];

  img.fillRect(0, 0, 1280, 800, darkBg);

  // Header Bar
  img.fillRect(0, 0, 1280, 70, [18, 26, 28]);
  img.fillRect(0, 69, 1280, 1, line);
  img.fillRoundedRect(60, 18, 34, 34, 7, [22, 34, 28]);
  img.drawBorder(60, 18, 34, 34, 7, 1.2, accent);
  img.fillRoundedRect(105, 27, 130, 16, 3, [243, 245, 239]);

  // Section Title: Move Quality & Breakdown
  img.fillRoundedRect(60, 100, 280, 24, 3, [243, 245, 239]);
  img.fillRoundedRect(60, 132, 450, 14, 2, [168, 181, 174]);

  // Full-width Side-by-Side Breakdown Card (y: 165, h: 290)
  img.fillRoundedRect(60, 165, 1160, 290, 8, [20, 28, 25]);
  img.drawBorder(60, 165, 1160, 290, 8, 1, [43, 55, 50]);

  // Table header
  img.fillRect(60, 215, 1160, 1, line);
  img.fillRoundedRect(100, 185, 200, 16, 3, accent);
  img.fillRoundedRect(530, 185, 180, 16, 3, [168, 181, 174]);
  img.fillRoundedRect(960, 185, 200, 16, 3, [131, 220, 218]);

  const cats = [
    { label: "Best Moves", col: accent, y: 230 },
    { label: "Great Moves", col: [134, 239, 172], y: 265 },
    { label: "Good Moves", col: [155, 181, 165], y: 300 },
    { label: "Inaccuracies", col: [246, 224, 118], y: 335 },
    { label: "Mistakes", col: [255, 191, 128], y: 370 },
    { label: "Blunders", col: [255, 155, 138], y: 405 }
  ];

  for (const c of cats) {
    img.fillRect(80, c.y + 24, 1120, 1, [28, 38, 33]);
    img.fillRoundedRect(140, c.y + 2, 60, 16, 2, [243, 245, 239]);
    img.fillRoundedRect(550, c.y, 140, 20, 4, c.col);
    img.fillRoundedRect(1020, c.y + 2, 60, 16, 2, [243, 245, 239]);
  }

  // Section 2: Coach's Notes Cards (y: 480)
  img.fillRoundedRect(60, 480, 240, 22, 3, [243, 245, 239]);

  const notes = [
    { y: 520, badgeCol: [255, 155, 138], ply: "18... Qh4" },
    { y: 605, badgeCol: [255, 191, 128], ply: "22... d5" },
    { y: 690, badgeCol: accent, ply: "24. Re1" }
  ];

  for (const n of notes) {
    img.fillRoundedRect(60, n.y, 1160, 72, 6, [22, 31, 27]);
    img.drawBorder(60, n.y, 1160, 72, 6, 1, [43, 55, 50]);
    // Move token
    img.fillRoundedRect(80, n.y + 20, 80, 32, 4, [32, 43, 38]);
    img.fillRoundedRect(95, n.y + 30, 50, 12, 2, [243, 245, 239]);
    // Note title & text
    img.fillRoundedRect(180, n.y + 18, 280, 14, 2, [243, 245, 239]);
    img.fillRoundedRect(180, n.y + 38, 700, 12, 2, [168, 181, 174]);
    // Badge
    img.fillRoundedRect(1080, n.y + 22, 100, 26, 4, n.badgeCol);
  }

  return img.toPng();
}

// 4. Generate Store Screenshot 3 (Freeplay What-If Analysis Mode): 1280x800 px
function generateFreeplayScreenshot() {
  const img = new ImageBuffer(1280, 800);
  const darkBg = [16, 23, 25];
  const accent = [216, 243, 106];
  const line = [52, 65, 61];
  const lightSq = [212, 217, 200];
  const darkSq = [113, 136, 118];

  img.fillRect(0, 0, 1280, 800, darkBg);

  // Header Bar
  img.fillRect(0, 0, 1280, 70, [18, 26, 28]);
  img.fillRect(0, 69, 1280, 1, line);
  img.fillRoundedRect(60, 18, 34, 34, 7, [22, 34, 28]);
  img.drawBorder(60, 18, 34, 34, 7, 1.2, accent);
  img.fillRoundedRect(105, 27, 130, 16, 3, [243, 245, 239]);

  // Freeplay Title Banner
  img.fillRoundedRect(60, 95, 1160, 72, 8, [24, 36, 32]);
  img.drawBorder(60, 95, 1160, 72, 8, 1, accent);
  img.fillRoundedRect(90, 115, 260, 18, 3, accent); // "FREEPLAY / WHAT-IF ANALYSIS"
  img.fillRoundedRect(90, 140, 480, 12, 2, [168, 181, 174]); // "Test alternate lines from any move"

  // Board (x: 60, y: 195)
  const boardX = 60;
  const boardY = 195;
  const boardSize = 512;
  const sqSize = boardSize / 8;

  img.drawBorder(boardX - 1, boardY - 1, boardSize + 2, boardSize + 2, 4, 1, [100, 117, 106]);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const isDark = (r + c) % 2 === 1;
      img.fillRect(boardX + c * sqSize, boardY + r * sqSize, sqSize, sqSize, isDark ? darkSq : lightSq);
    }
  }

  // Selected piece circle & legal square dots
  img.drawBorder(boardX + 3 * sqSize + 4, boardY + 4 * sqSize + 4, sqSize - 8, sqSize - 8, (sqSize - 8) / 2, 3, accent);
  // Legal moves
  const legalCoords = [[2, 2], [2, 4], [4, 2], [5, 3], [5, 5]];
  for (const [r, c] of legalCoords) {
    const cx = boardX + c * sqSize + sqSize / 2;
    const cy = boardY + r * sqSize + sqSize / 2;
    img.fillRoundedRect(cx - 7, cy - 7, 14, 14, 7, [216, 243, 106, 200]);
  }

  // Right Column: Freeplay Panel (x: 610, y: 195)
  const rightX = 610;
  img.fillRoundedRect(rightX, 195, 610, 512, 8, [22, 31, 27]);
  img.drawBorder(rightX, 195, 610, 512, 8, 1, [43, 55, 50]);

  // Card Header
  img.fillRoundedRect(rightX + 24, 220, 180, 18, 3, [243, 245, 239]);
  img.fillRoundedRect(rightX + 480, 218, 100, 22, 4, accent); // "+1.4 · White holds edge"

  // Live Engine Status Box
  img.fillRoundedRect(rightX + 24, 260, 560, 90, 6, [18, 25, 22]);
  img.drawBorder(rightX + 24, 260, 560, 90, 6, 1, line);
  img.fillRoundedRect(rightX + 40, 278, 220, 14, 2, accent);
  img.fillRoundedRect(rightX + 40, 302, 480, 12, 2, [168, 181, 174]);
  img.fillRoundedRect(rightX + 40, 322, 380, 12, 2, [168, 181, 174]);

  // Alternate Line History
  img.fillRoundedRect(rightX + 24, 375, 200, 16, 2, [243, 245, 239]);
  for (let i = 0; i < 4; i++) {
    const ny = 405 + i * 48;
    img.fillRoundedRect(rightX + 24, ny, 560, 38, 4, [26, 36, 31]);
    img.fillRoundedRect(rightX + 40, ny + 12, 80, 14, 2, accent);
    img.fillRoundedRect(rightX + 140, ny + 12, 300, 14, 2, [168, 181, 174]);
    img.fillRoundedRect(rightX + 500, ny + 10, 65, 18, 3, [34, 197, 94]);
  }

  // Buttons
  img.fillRoundedRect(rightX + 24, 635, 170, 38, 6, [32, 43, 38]);
  img.fillRoundedRect(rightX + 210, 635, 170, 38, 6, [45, 30, 25]);

  return img.toPng();
}

// Write files to store-assets
const promoPng = generatePromoTile();
fs.writeFileSync(path.join(assetsDir, "promo-440x280.png"), promoPng);
console.log(`Generated store-assets/promo-440x280.png (${promoPng.length} bytes)`);

const reviewPng = generateReviewScreenshot();
fs.writeFileSync(path.join(assetsDir, "screenshot1-review.png"), reviewPng);
console.log(`Generated store-assets/screenshot1-review.png (${reviewPng.length} bytes)`);

const breakdownPng = generateBreakdownScreenshot();
fs.writeFileSync(path.join(assetsDir, "screenshot2-breakdown.png"), breakdownPng);
console.log(`Generated store-assets/screenshot2-breakdown.png (${breakdownPng.length} bytes)`);

const freeplayPng = generateFreeplayScreenshot();
fs.writeFileSync(path.join(assetsDir, "screenshot3-freeplay.png"), freeplayPng);
console.log(`Generated store-assets/screenshot3-freeplay.png (${freeplayPng.length} bytes)`);
