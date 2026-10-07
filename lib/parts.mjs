// Clawd y los aparatos, en píxeles de Clawd. Cada pieza redondea su posición
// una sola vez y dibuja el resto relativo a eso, así las partes no se separan.

import { fill } from "./canvas.mjs";

export const SCENE_W = 41;
export const SCENE_H = 16;
export const X = 14;       // cuerpo parado: columnas 14..26
export const Y = 5;        // cuerpo: filas 5..12; patas: 13..14
export const GROUND = 15;  // fila de la sombra

const LEGS = { both: [0, 2, 10, 12], left: [0, 2], right: [10, 12], none: [] };

// Para superficies sin Raster.
export const CLAWD_TEXT = [" ▐▛███▛█ ", "▝▜██████▀", " ▝▝   ▝▝ "];
export const CLAWD_TEXT_UP = ["▗▟▛███▛█▄", " ▜██████▘", " ▝▝   ▝▝ "];

// (x, y): esquina del cuerpo. sq > 0 aplasta y sq < 0 estira.
// tail: { side: 1 | -1, phase, amp }
export function clawd(cv, o) {
  const { eye = "open", look = 0, legs = "both", legLen = 2, splay = 0, tail = { side: 1, phase: 0, amp: 0.4 } } = o;
  const sq = cv.s === 1 ? Math.round(o.sq ?? 0) : (o.sq ?? 0);
  const x = cv.snap(o.x), y = cv.snap(o.y);
  const bw = 13 + 2 * sq, bh = 8 - sq, bx = x - sq, by = y + sq;
  fill(cv, bx, by, bw, bh, "C");

  const bandY = cv.snap(by + bh / 8);
  fill(cv, bx, bandY, bw, 1, "V");
  for (let i = 0; i < 3; i++) {
    const tx = tail.side > 0 ? bx + bw + i : bx - 1 - i;
    const ty = bandY + cv.snap(tail.amp * Math.sin(tail.phase - 0.9 * i) * (i + 1) / 3 + i * 0.3);
    fill(cv, tx, ty, 1, 1, "V");
  }

  // ojos en las columnas 2 y 10; se separan al aplastarse
  const lk = cv.snap(look), ey = cv.snap(by + 2 * bh / 8);
  const exL = cv.snap(x + 2 - sq * 0.5) + lk, exR = cv.snap(x + 10 + sq * 0.5) + lk;
  for (const ex of [exL, exR]) {
    switch (eye) {
      case "open": fill(cv, ex, ey, 1, 2, "E"); break;
      case "half": fill(cv, ex, ey + 1, 1, 1, "E"); break;
      case "closed": fill(cv, ex - 1, ey + 1, 3, 1, "E"); break;
      case "happy": fill(cv, ex - 1, ey + 1, 1, 1, "E"); fill(cv, ex, ey, 1, 1, "E"); fill(cv, ex + 1, ey + 1, 1, 1, "E"); break;
    }
  }
  if (eye === "effort") { // > <
    fill(cv, exL - 1, ey, 1, 1, "E"); fill(cv, exL, ey + 1, 1, 1, "E"); fill(cv, exL - 1, ey + 2, 1, 1, "E");
    fill(cv, exR + 1, ey, 1, 1, "E"); fill(cv, exR, ey + 1, 1, 1, "E"); fill(cv, exR + 1, ey + 2, 1, 1, "E");
  }

  const len = cv.snap(legLen), sp = cv.snap(splay);
  if (len > 0) for (const c of LEGS[legs]) fill(cv, x + c + (c < 6 ? -sp : sp), y + 8, 1, len, "C");
  return { bx, by, bw, bh };
}

export const nub = (cv, x, y) => fill(cv, cv.snap(x), cv.snap(y), 2, 2, "C");

export function dumbbell(cv, nx, ny) {
  const x = cv.snap(nx), y = cv.snap(ny);
  fill(cv, x - 2, y - 1, 2, 4, "D"); fill(cv, x + 2, y - 1, 2, 4, "D"); fill(cv, x, y, 2, 2, "C");
}

export function barbell(cv, by, x0, x1) {
  const y = cv.snap(by);
  fill(cv, x0 + 2, y, x1 - x0 - 3, 1, "d");
  fill(cv, x0, y - 2, 2, 5, "D"); fill(cv, x1 - 1, y - 2, 2, 5, "D");
}

export function shadow(cv, cx, height = 0) {
  const w = Math.max(5, 11 - height * 1.6);
  if (cv.s === 1) { fill(cv, Math.round(cx - w / 2), GROUND, Math.round(w), 1, "g"); return; }
  fill(cv, cx - w / 2, GROUND + 0.3, w, 0.4, "g");
  fill(cv, cx - w / 2 + 0.6, GROUND + 0.15, w - 1.2, 0.15, "g");
  fill(cv, cx - w / 2 + 0.6, GROUND + 0.7, w - 1.2, 0.15, "g");
}

// En el PNG las chispas son una cruz.
export function particle(cv, p) {
  if (cv.s === 1 || p.ch !== "Y") { fill(cv, p.x, p.y, p.size ?? 1, p.size ?? 1, p.ch); return; }
  const k = Math.max(0.2, p.life / p.max);
  fill(cv, p.x, p.y + 0.35, 1, 0.3, "Y"); fill(cv, p.x + 0.35, p.y, 0.3, 1, "Y");
  if (k > 0.5) fill(cv, p.x + 0.2, p.y + 0.2, 0.6, 0.6, "Y");
}
