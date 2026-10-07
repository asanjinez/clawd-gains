import { test } from "node:test";
import assert from "node:assert/strict";
import { createHoldFilter } from "../lib/hold.mjs";

// Devuelve cuántas pulsaciones cuentan.
const counted = (times) => { const f = createHoldFilter(); return times.filter((t) => f.accept(t)).length; };
// Tecla sostenida: demora inicial y después repeticiones regulares.
const held = (delay, every, n) => [0, ...Array.from({ length: n }, (_, i) => delay + i * every)];
// Spam humano: base ± variación con semilla.
function mash(base, spread, n, seed = 1) {
  const out = [0];
  for (let i = 1; i < n; i++) { seed = (seed * 16807) % 2147483647; out.push(out[i - 1] + base + ((seed / 2147483647) * 2 - 1) * spread); }
  return out.map(Math.round);
}

test("mantener la tecla en Windows o Linux (repite cada 33-40 ms) cuenta como mucho dos veces", () => {
  assert.ok(counted(held(500, 33, 60)) <= 2);
  assert.ok(counted(held(660, 40, 60)) <= 2);
});

test("mantener la tecla en macOS (repite cada ~90 ms, exacto) deja de contar enseguida", () => {
  const n = counted(held(500, 90, 60));
  assert.ok(n <= 8, `contó ${n}`);
});

test("el spam humano cuenta entero, aunque sea muy rápido", () => {
  assert.equal(counted(mash(110, 25, 100)), 100, "~9 toques por segundo");
  assert.equal(counted(mash(70, 15, 100, 7)), 100, "~14 toques por segundo, el límite humano");
  assert.equal(counted(mash(250, 80, 50, 3)), 50, "tranquilo");
});

test("soltar y volver a apretar cuenta de nuevo", () => {
  const f = createHoldFilter();
  for (const t of held(500, 33, 30)) f.accept(t);
  assert.equal(f.accept(2000), true);
});
