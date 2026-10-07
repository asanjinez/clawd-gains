// PNG indexado con transparencia. El worker de mods no tiene zlib ni
// CompressionStream (2.1.289), así que acá va un deflate mínimo: Huffman fijo y
// LZ77 que solo compara con el píxel anterior y con la fila de arriba.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes, start = 0, end = bytes.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

function bitWriter(capacity) {
  let buf = new Uint8Array(capacity), pos = 0, acc = 0, n = 0;
  const grow = () => { const b = new Uint8Array(buf.length * 2); b.set(buf); buf = b; };
  return {
    // LSB primero, como pide deflate
    bits(v, count) {
      acc |= v << n; n += count;
      while (n >= 8) { if (pos >= buf.length) grow(); buf[pos++] = acc & 0xff; acc >>>= 8; n -= 8; }
    },
    // salvo los códigos Huffman, que van MSB primero
    code(c, len) { let r = 0; for (let i = 0; i < len; i++) r = (r << 1) | ((c >>> i) & 1); this.bits(r, len); },
    finish() { if (n > 0) { if (pos >= buf.length) grow(); buf[pos++] = acc & 0xff; } return buf.subarray(0, pos); },
  };
}

function writeLiteral(w, v) {
  if (v < 144) w.code(0x30 + v, 8);
  else if (v < 256) w.code(0x190 + v - 144, 9);
  else if (v < 280) w.code(v - 256, 7);
  else w.code(0xc0 + v - 280, 8);
}

function writeMatch(w, len, dist) {
  let li = LEN_BASE.length - 1;
  while (LEN_BASE[li] > len) li--;
  writeLiteral(w, 257 + li);
  if (LEN_EXTRA[li]) w.bits(len - LEN_BASE[li], LEN_EXTRA[li]);
  let di = DIST_BASE.length - 1;
  while (DIST_BASE[di] > dist) di--;
  w.code(di, 5);
  if (DIST_EXTRA[di]) w.bits(dist - DIST_BASE[di], DIST_EXTRA[di]);
}

export function zlibCompress(data, rowBytes = 0) {
  const w = bitWriter(Math.max(64, data.length >> 2));
  w.bits(0x78, 8); w.bits(0x01, 8);         // encabezado zlib
  w.bits(1, 1); w.bits(1, 2);               // BFINAL=1, BTYPE=01 (Huffman fijo)
  const dists = rowBytes > 1 && rowBytes <= 32768 ? [1, rowBytes] : [1];
  let i = 0;
  while (i < data.length) {
    let best = 0, bestDist = 0;
    for (const d of dists) {
      if (d > i) continue;
      const max = Math.min(258, data.length - i);
      let l = 0;
      while (l < max && data[i + l] === data[i + l - d]) l++;
      if (l > best) { best = l; bestDist = d; }
    }
    if (best >= 3) { writeMatch(w, best, bestDist); i += best; }
    else { writeLiteral(w, data[i]); i++; }
  }
  writeLiteral(w, 256);                     // fin de bloque
  const body = w.finish();
  const out = new Uint8Array(body.length + 4);
  out.set(body);
  const ad = adler32(data);
  out[body.length] = ad >>> 24; out[body.length + 1] = (ad >>> 16) & 0xff; out[body.length + 2] = (ad >>> 8) & 0xff; out[body.length + 3] = ad & 0xff;
  return out;
}

// pixels: índices de paleta. palette: [[r, g, b, a], ...], hasta 256 colores.
export function encodeIndexedPNG(width, height, pixels, palette) {
  const rowBytes = width + 1;
  const raw = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0;                  // sin filtro: LZ77 ya agarra las filas repetidas
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * rowBytes + 1);
  }
  const idat = zlibCompress(raw, rowBytes);

  const plte = new Uint8Array(palette.length * 3);
  palette.forEach(([r, g, b], i) => { plte[i * 3] = r; plte[i * 3 + 1] = g; plte[i * 3 + 2] = b; });
  let lastAlpha = -1;
  palette.forEach(([, , , a], i) => { if ((a ?? 255) < 255) lastAlpha = i; });
  const trns = new Uint8Array(lastAlpha + 1);
  for (let i = 0; i <= lastAlpha; i++) trns[i] = palette[i][3] ?? 255;

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 3;                 // 8 bits, color indexado

  const chunks = [["IHDR", ihdr], ["PLTE", plte]];
  if (trns.length) chunks.push(["tRNS", trns]);
  chunks.push(["IDAT", idat], ["IEND", new Uint8Array(0)]);

  const size = 8 + chunks.reduce((n, [, d]) => n + 12 + d.length, 0);
  const png = new Uint8Array(size);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  let p = 8;
  for (const [type, data] of chunks) {
    const v = new DataView(png.buffer, p);
    v.setUint32(0, data.length);
    for (let k = 0; k < 4; k++) png[p + 4 + k] = type.charCodeAt(k);
    png.set(data, p + 8);
    v.setUint32(8 + data.length, crc32(png, p + 4, p + 8 + data.length));
    p += 12 + data.length;
  }
  return png;
}

export function toBase64(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  return Buffer.from(bytes).toString("base64");
}
