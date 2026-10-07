#!/usr/bin/env node
// Prueba la animación en la terminal, sin Claude Code.
//   node preview.mjs         x entrena, 1-6 cambia de ejercicio, t cansado, f festejo, q sale
//   node preview.mjs --demo  toca x solo
//   node preview.mjs --hd    PNG por el protocolo de kitty (kitty, Ghostty)

import { createEngine, EXERCISE_IDS } from "./lib/engine.mjs";
import { createAnimator } from "./lib/motion.mjs";
import { createCanvas, toAnsi, toPNG } from "./lib/canvas.mjs";
import { SCENE_W, SCENE_H } from "./lib/parts.mjs";
import { createHoldFilter } from "./lib/hold.mjs";
import { STRINGS } from "./lib/i18n.mjs";

const args = process.argv.slice(2);
const demo = args.includes("--demo"), hd = args.includes("--hd");
const NAMES = { curl: "Curl de bíceps", sentadillas: "Sentadillas", press: "Press con barra", crabwalk: "Crab walk", dominadas: "Dominadas", soga: "Saltar la soga" };

let engine = createEngine({ exercises: EXERCISE_IDS });
const anim = createAnimator({ seed: 11 });
const cv = createCanvas(SCENE_W, SCENE_H, hd ? 10 : 1);
const out = process.stdout;
const ROWS = SCENE_H / 2;

const dim = (s) => `\x1b[2m${s}\x1b[22m`, bold = (s) => `\x1b[1m${s}\x1b[22m`, orange = (s) => `\x1b[38;2;215;119;87m${s}\x1b[39m`, green = (s) => `\x1b[32m${s}\x1b[39m`, yellow = (s) => `\x1b[33m${s}\x1b[39m`;
const SPARK = "▁▂▃▄▅▆▇█";
const hold = createHoldFilter();
let holdUntil = 0;

function hud(now) {
  const s = engine.state, c = engine.config, ex = engine.exercise();
  const cells = Math.min(c.repsPerSet, 20), filled = Math.round((s.repsInSet / c.repsPerSet) * cells);
  const tempo = engine.tempo(now), perSec = tempo.reduce((a, b) => a + b, 0) / 2;
  const title = s.mode === "festejo" ? green(bold("🎉 ¡BIEN AHÍ!")) : orange(bold(NAMES[ex].toUpperCase()));
  const aside = now < holdUntil ? yellow(STRINGS.es.hold) : s.mode === "cansado" ? "💦 ¡seguí con x!" : dim(`${s.repsInSet}/${c.repsPerSet}`);
  return [
    "", `${title}  ${aside}`,
    `${orange("━".repeat(filled))}${dim("─".repeat(cells - filled))}  ${c.tapsPerRep > 1 ? orange(Array.from({ length: c.tapsPerRep }, (_, k) => (k < s.tapsTowardRep ? "●" : "○")).join("")) : ""}`,
    `${dim("ritmo")} ${tempo.map((n) => SPARK[Math.min(n, 7)]).join("")} ${perSec >= 4.5 ? green("¡a full!") : ""}`,
    dim(`sesión ${s.repsSession} · récord ${s.stats.record}`),
    "", `${orange("x")}${dim(": entrenar · 1-6 ejercicio · t cansado · f festejo · q sale")}`, "",
  ];
}

// Protocolo gráfico de kitty, en trozos de 4096.
function kittyImage(b64) {
  let s = "";
  for (let i = 0; i < b64.length; i += 4096) {
    const chunk = b64.slice(i, i + 4096), more = i + 4096 < b64.length ? 1 : 0;
    s += i === 0 ? `\x1b_Ga=T,f=100,i=7,q=2,c=${SCENE_W},r=${ROWS},C=1,m=${more};${chunk}\x1b\\` : `\x1b_Gm=${more};${chunk}\x1b\\`;
  }
  return s;
}

let lastDemoTap = 0;
function draw() {
  const now = Date.now();
  if (demo && now - lastDemoTap > 140) { engine.tap(now); lastDemoTap = now; }
  engine.tick(now);
  const st = engine.snapshot(now);
  anim.update(now, st);
  anim.draw(cv, st);
  const right = hud(now);
  let frame = "\x1b[H";
  if (hd) {
    frame += kittyImage(toPNG(cv));
    for (let r = 0; r < ROWS; r++) frame += `\x1b[${r + 1};${SCENE_W + 3}H\x1b[K${right[r] ?? ""}`;
  } else {
    const left = toAnsi(cv);
    for (let r = 0; r < ROWS; r++) frame += `${left[r]}  ${right[r] ?? ""}\x1b[K\n`;
  }
  out.write(frame);
}

out.write("\x1b[?25l\x1b[2J");
const timer = setInterval(draw, 33);
const quit = () => { clearInterval(timer); out.write(`\x1b[${ROWS + 2};1H\x1b[?25h\n`); process.exit(0); };
process.on("SIGINT", quit);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (buf) => {
    const k = buf.toString();
    const now = Date.now();
    if (k === "q" || k === "\x03") quit();
    else if (k === "x") { if (hold.accept(now)) engine.tap(now); else holdUntil = now + 1200; }
    else if (/^[1-6]$/.test(k)) { const stats = engine.state.stats; engine = createEngine({ exercises: [EXERCISE_IDS[Number(k) - 1]] }, stats); }
    else if (k === "t") { engine.tap(now - 4100); engine.tick(now); }
    else if (k === "f") { engine.startTurn(now); for (let i = 0; i < 3; i++) engine.tap(now); engine.endTurn(now); }
  });
}
