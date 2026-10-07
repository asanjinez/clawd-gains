// Lienzo en píxeles de Clawd (el cuerpo mide 13x8), con s subpíxeles por píxel.
// s = 1 sale como medios bloques (Raster) y s = 10, como PNG (Image).

import { encodeIndexedPNG, toBase64 } from "./png.mjs";

// El 0 es transparente. La transparencia parcial solo se ve en el PNG.
const COLORS = [
  [".", 0, 0, 0, 0],
  ["C", 0xd7, 0x77, 0x57, 255], // cuerpo (clawd_body)
  ["E", 0x14, 0x14, 0x14, 255], // ojo
  ["V", 0xef, 0x44, 0x44, 255], // vincha
  ["D", 0x4b, 0x55, 0x63, 255], // disco
  ["d", 0x9c, 0xa3, 0xaf, 255], // barra, mango
  ["K", 0x37, 0x41, 0x51, 255], // poste
  ["S", 0x60, 0xa5, 0xfa, 255], // sudor
  ["Y", 0xfd, 0xe0, 0x47, 255], // chispa, estrella
  ["R", 0xb4, 0x53, 0x09, 255], // soga
  ["L", 0x4a, 0xde, 0x80, 255], // confeti verde
  ["P", 0x9c, 0xa3, 0xaf, 140], // polvo
  ["g", 0x00, 0x00, 0x00, 70],  // sombra
];

export const INDEX = Object.fromEntries(COLORS.map(([ch], i) => [ch, i]));
export const PALETTE_RGBA = COLORS.map(([, r, g, b, a]) => [r, g, b, a]);
// En medios bloques la sombra va en gris sólido.
export const PALETTE = Object.fromEntries(COLORS.slice(1).map(([ch, r, g, b]) => [ch, ch === "g" ? 0x2a2a2e : (r << 16) | (g << 8) | b]));

export function createCanvas(w, h, s = 1) {
  const W = Math.round(w * s), H = Math.round(h * s);
  return { w, h, s, W, H, px: new Uint8Array(W * H), snap: (v) => Math.round(v * s) / s };
}

export const clear = (cv) => cv.px.fill(0);

export function fill(cv, x, y, w, h, ch) {
  const c = INDEX[ch];
  const x0 = Math.max(0, Math.round(x * cv.s)), x1 = Math.min(cv.W, Math.round((x + w) * cv.s));
  const y0 = Math.max(0, Math.round(y * cv.s)), y1 = Math.min(cv.H, Math.round((y + h) * cv.s));
  for (let yy = y0; yy < y1; yy++) cv.px.fill(c, yy * cv.W + x0, yy * cv.W + Math.max(x0, x1));
}

export const TERMINAL_DEFAULT = 0x1000000;
const UPPER_HALF = 0x2580, LOWER_HALF = 0x2584, SPACE = 0x20;
const LETTERS = COLORS.map(([ch]) => ch);

// Celdas de Raster: base64 de u32 [codePoint, frente, fondo].
export function toCells(cv) {
  const rows = cv.H >> 1, u32 = new Uint32Array(cv.W * rows * 3);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cv.W; c++) {
    const top = PALETTE[LETTERS[cv.px[2 * r * cv.W + c]]], bot = PALETTE[LETTERS[cv.px[(2 * r + 1) * cv.W + c]]];
    const cell = top === undefined && bot === undefined ? [SPACE, TERMINAL_DEFAULT, TERMINAL_DEFAULT]
      : top === undefined ? [LOWER_HALF, bot, TERMINAL_DEFAULT]
      : [UPPER_HALF, top, bot ?? TERMINAL_DEFAULT];
    u32.set(cell, (r * cv.W + c) * 3);
  }
  return toBase64(new Uint8Array(u32.buffer));
}

export const toPNG = (cv) => toBase64(encodeIndexedPNG(cv.W, cv.H, cv.px, PALETTE_RGBA));

// Para los tests.
export function toGrid(cv) {
  const out = [];
  for (let y = 0; y < cv.H; y++) { let row = ""; for (let x = 0; x < cv.W; x++) row += LETTERS[cv.px[y * cv.W + x]]; out.push(row); }
  return out;
}

// Para preview.mjs.
export function toAnsi(cv) {
  const rgb = (v) => `${(v >> 16) & 255};${(v >> 8) & 255};${v & 255}`;
  const lines = [];
  for (let r = 0; r < cv.H >> 1; r++) {
    let line = "";
    for (let c = 0; c < cv.W; c++) {
      const top = PALETTE[LETTERS[cv.px[2 * r * cv.W + c]]], bot = PALETTE[LETTERS[cv.px[(2 * r + 1) * cv.W + c]]];
      if (top === undefined && bot === undefined) { line += " "; continue; }
      if (top === undefined) { line += `\x1b[38;2;${rgb(bot)}m▄\x1b[0m`; continue; }
      line += `\x1b[38;2;${rgb(top)}${bot === undefined ? "" : `;48;2;${rgb(bot)}`}m▀\x1b[0m`;
    }
    lines.push(line);
  }
  return lines;
}
