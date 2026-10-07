import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { createEngine, EXERCISE_IDS } from "../lib/engine.mjs";
import { createAnimator } from "../lib/motion.mjs";
import { createCanvas, toCells, toPNG, toGrid, TERMINAL_DEFAULT, PALETTE } from "../lib/canvas.mjs";
import { SCENE_W, SCENE_H } from "../lib/parts.mjs";

// Simula una sesión a 30 fps y devuelve los cuadros.
function session({ exercise = "curl", tapMs = 150, ms = 900, s = 1, before, still } = {}) {
  const engine = createEngine({ exercises: [exercise] });
  const anim = createAnimator({ seed: 5, still });
  const cv = createCanvas(SCENE_W, SCENE_H, s);
  let now = 10_000;
  before?.(engine, now);
  const frames = [];
  let next = tapMs ? now + 50 : Infinity;
  for (let t = now; t <= now + ms; t += 33) {
    while (next <= t) { engine.tap(next); next += tapMs; }
    engine.tick(t);
    const st = engine.snapshot(t);
    anim.update(t, st);
    anim.draw(cv, st);
    frames.push({ t, grid: toGrid(cv), px: cv.px.slice(), state: anim.state, cv, x: anim.state.rep.x, target: st.taps, squash: anim.state.squash, sparks: anim.state.particles.filter((p) => p.ch === "Y").length });
  }
  return { frames, engine, anim, cv };
}

test("hay movimiento entre toques: cuadros intermedios distintos aunque no haya toque nuevo", () => {
  const { frames } = session({ tapMs: 300, ms: 600 });
  // 300 ms entre toques son 9 cuadros: tiene que haber más de 2 distintos
  const between = frames.filter((f) => f.t > 10_050 && f.t < 10_350).map((f) => f.grid.join("\n"));
  assert.ok(new Set(between).size >= 4, `solo ${new Set(between).size} dibujos distintos entre toques`);
});

test("en reposo Clawd respira: el dibujo cambia con el tiempo sin tocar nada", () => {
  const { frames } = session({ tapMs: 0, ms: 2600 });
  assert.ok(new Set(frames.map((f) => f.grid.join("\n"))).size >= 2);
});

test("un toque es una repetición entera: la fase sube, vuelve abajo y se queda, sin pasarse", () => {
  const { frames } = session({ tapMs: 60_000, ms: 700 });   // un solo toque, a los 50 ms
  assert.ok(frames.every((f) => f.x <= 1), "nunca se pasa del objetivo");
  assert.ok(frames.some((f) => f.x > 0.3 && f.x < 0.45), "pasa por arriba");
  assert.equal(frames.at(-1).x, 1, "termina abajo, quieta");
  const done = frames.findIndex((f) => f.x === 1);
  assert.ok(done > 8 && done < 20, `una repetición sola dura ${done} cuadros`);
});

test("el golpe (aplastar y chispas) llega arriba de la repetición, no al apretar", () => {
  const { frames } = session({ tapMs: 60_000, ms: 500 });
  const tap = frames.findIndex((f) => f.target === 1);
  assert.ok(frames[tap].squash < 0.5 && frames[tap].sparks === 0, "al apretar todavía no");
  const hit = frames.findIndex((f) => f.squash > 0.9);
  assert.ok(hit > 0, "hay golpe");
  assert.ok(frames[hit].x >= 0.3 && frames[hit].x < 0.45, `arriba: fase ${frames[hit].x}`);
  assert.ok(frames[hit].sparks > 0, "chispas");
  assert.equal(frames.filter((f, i) => i > 0 && f.squash > frames[i - 1].squash).length, 1, "un solo golpe por repetición");
});

test("spamear no hace un borrón: la fase tiene velocidad tope y saltea repeticiones enteras", () => {
  const { frames } = session({ tapMs: 50, ms: 2000 });
  for (let i = 1; i < frames.length; i++) {
    const step = frames[i].x - frames[i - 1].x, seen = step - Math.floor(step + 1e-9);   // lo que se ve: sin las vueltas enteras
    assert.ok(seen <= 3.6 * 0.034, `cuadro ${i}: avanzó ${seen.toFixed(3)} de repetición`);
    assert.ok(frames[i].target - frames[i].x <= 1.5 + 1e-9, "no se atrasa más de una repetición y media");
  }
});

test("con movimiento reducido no hay bucle: cada toque alterna arriba y abajo", () => {
  const { frames } = session({ tapMs: 300, ms: 700, still: true });
  // toques impares: arriba; pares: abajo
  for (const f of frames.filter((f) => f.target > 0)) assert.equal(Math.round((f.x - Math.floor(f.x)) * 100) / 100, f.target % 2 ? 0.3 : 0, `${f.target} toques`);
  assert.ok(frames.every((f) => f.sparks === 0), "sin chispas");
});

test("ningún cuadro tiene brazos ni trazos finos: el cuerpo es bloques de 2x2 o patas de 1 px", () => {
  const scenarios = [
    ...EXERCISE_IDS.map((exercise) => ({ exercise, tapMs: 110, ms: 1200 })),
    { exercise: "curl", tapMs: 0, ms: 2600 },                                                // reposo
    { exercise: "curl", tapMs: 0, ms: 1500, before: (e, now) => e.tap(now - 4500) },          // cansado
    { exercise: "curl", tapMs: 0, ms: 1000, before: (e, now) => { e.startTurn(now - 500); for (let i = 0; i < 3; i++) e.tap(now - 400); e.endTurn(now - 1); } }, // festejo
  ];
  for (const sc of scenarios) {
    for (const { grid, t } of session(sc).frames) {
      // incluye lo que se dibuja encima del cuerpo: vincha, ojos, soga, barra y partículas
      const C = (x, y) => "CVERdSYPL".includes(grid[y]?.[x] ?? ".");
      for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[0].length; x++) {
        if (grid[y][x] !== "C") continue;
        const inBlock = [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => C(x + dx, y + dy) && C(x + dx + 1, y + dy) && C(x + dx, y + dy + 1) && C(x + dx + 1, y + dy + 1));
        const inLeg = grid[y][x - 1] !== "C" && grid[y][x + 1] !== "C";   // una soga que pasa delante no cuenta
        assert.ok(inBlock || inLeg, `${sc.exercise} t=${t}: trazo fino en (${x},${y})\n${grid.join("\n")}`);
      }
    }
  }
});

test("la escena no pinta fondo: las celdas vacías usan los colores de la terminal", () => {
  const { cv } = session({ ms: 300 });
  const u32 = new Uint32Array(Buffer.from(toCells(cv), "base64").buffer.slice(0));
  assert.equal(u32.length, SCENE_W * (SCENE_H / 2) * 3);
  const colors = new Set(Object.values(PALETTE));
  for (let i = 0; i < u32.length; i += 3) {
    if (u32[i] === 0x20) assert.deepEqual([u32[i + 1], u32[i + 2]], [TERMINAL_DEFAULT, TERMINAL_DEFAULT], "celda vacía sin color");
    else {
      assert.ok(colors.has(u32[i + 1]), "frente de la paleta");
      assert.ok(u32[i + 2] === TERMINAL_DEFAULT || colors.has(u32[i + 2]), "fondo de la terminal o un píxel de abajo");
    }
  }
  assert.equal(u32[0], 0x20, "la esquina de arriba a la izquierda está vacía");
});

test("el PNG de la imagen HD se decodifica igual al lienzo y su fondo es transparente", () => {
  const { cv } = session({ ms: 300, s: 10 });
  const png = Buffer.from(toPNG(cv), "base64");
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = {};
  for (let p = 8; p < png.length;) {
    const len = png.readUInt32BE(p), type = png.toString("latin1", p + 4, p + 8);
    chunks[type] = Buffer.concat([chunks[type] ?? Buffer.alloc(0), png.subarray(p + 8, p + 8 + len)]);
    p += 12 + len;
  }
  assert.equal(chunks.IHDR.readUInt32BE(0), SCENE_W * 10);
  assert.equal(chunks.IHDR.readUInt32BE(4), SCENE_H * 10);
  assert.equal(chunks.tRNS[0], 0, "el índice 0 (fondo) es transparente");
  const raw = zlib.inflateSync(chunks.IDAT), W = cv.W;
  for (let y = 0; y < cv.H; y++) assert.deepEqual(raw.subarray(y * (W + 1) + 1, (y + 1) * (W + 1)), Buffer.from(cv.px.subarray(y * W, (y + 1) * W)));
  assert.ok(png.length < 20_000, `un cuadro HD pesa ${png.length} bytes`);
});

test("en HD el movimiento avanza de a décimas de píxel", () => {
  const lo = session({ tapMs: 300, ms: 300, s: 1 }).frames.map((f) => f.grid.join("")), hi = session({ tapMs: 300, ms: 300, s: 10 }).frames.map((f) => f.px.join(","));
  assert.ok(new Set(hi).size > new Set(lo).size, "más cuadros distintos en HD que en medios bloques");
});
