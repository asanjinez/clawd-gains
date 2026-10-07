// Cómo se ve Clawd en cada cuadro, a partir del estado de engine.mjs.
// No usa timers: el tiempo y la semilla vienen de afuera, para poder testearlo.

import { clear } from "./canvas.mjs";
import { clawd, nub, dumbbell, barbell, shadow, particle, X, Y, GROUND, SCENE_W } from "./parts.mjs";
import { fill } from "./canvas.mjs";

const TAU = Math.PI * 2;
const frac = (v) => v - Math.floor(v);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Altura (0..1) en el punto p (0..1) de una repetición: sube rápido, aguanta y baja.
const TOP = 0.3, HOLD = 0.45;
function lift(p) {
  if (p < TOP) return 1 - (1 - p / TOP) ** 3;
  if (p < HOLD) return 1;
  return (1 + Math.cos(Math.PI * (p - HOLD) / (1 - HOLD))) / 2;
}
// El press arranca con un amague hacia abajo.
const PRESS_DIP = 0.1;
// Punto de la repetición donde saltan las chispas. En la soga, cuando Clawd cae.
const IMPACT = { press: PRESS_DIP + (1 - PRESS_DIP) * TOP, soga: 0.75 };
const impactAt = (ex) => IMPACT[ex] ?? TOP;

// Repeticiones por segundo. Si se atrasa más de MAX_LAG, saltea repeticiones enteras.
const MIN_SPEED = 2.2, MAX_SPEED = 3.6, MAX_LAG = 1.5;

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Resorte amortiguado, en subpasos para que no diverja.
function spring(s, target, dt, omega, zeta) {
  const n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (omega * omega * (target - s.x) - 2 * zeta * omega * s.v) * h;
    s.x += s.v * h;
  }
}

// still: movimiento reducido. Cada toque alterna entre arriba y abajo.
export function createAnimator(opts = {}) {
  const tapsPerRep = opts.tapsPerRep ?? 1;
  const still = opts.still === true;
  const rnd = mulberry32(opts.seed ?? 7);
  const a = {
    t: null,
    rep: { x: 0, v: 0 },        // fase: 1 = una repetición
    impacts: 0,                 // golpes ya dados
    walk: { x: 0, v: 0 },       // crab walk: columnas recorridas
    squash: 0,
    hopAt: -1e9,                // saltito al cambiar de ejercicio
    look: 0, lookTarget: 0, lookUntil: 0, nextLook: 4200,
    blinkUntil: 0, nextBlink: 2600,
    tail: 0,                    // cola de la vincha
    tempo: 0,                   // toques por segundo, suavizado
    particles: [],
    nextSweat: 0, nextDrip: 0, nextConfetti: 0,
    last: { mode: null, exercise: null },
    modeAt: 0,
  };
  const impactsAt = (x, ex) => Math.floor(x - impactAt(ex));

  // La fase va hacia el objetivo sin pasarse, a velocidad acotada.
  function follow(target, dt, ex) {
    const r = a.rep;
    // si el objetivo baja (set nuevo, mismo ejercicio), resta repeticiones enteras
    if (target < r.x) { const k = Math.ceil(r.x - target - 1e-9); r.x -= k; a.impacts -= k; }
    if (target - r.x > MAX_LAG) { const k = Math.ceil(target - r.x - MAX_LAG); r.x += k; a.impacts += k; }
    const lag = target - r.x;
    const v = clamp(MIN_SPEED + (MAX_SPEED - MIN_SPEED) * (lag - 1) / (MAX_LAG - 1), MIN_SPEED, MAX_SPEED);
    const step = Math.min(lag, v * dt);
    r.x += step; r.v = dt > 0 ? step / dt : 0;
  }

  const spawn = (p) => a.particles.push({ size: 1, g: 0, ...p, max: p.life });
  // dir: -1 izquierda, 1 derecha, 0 arriba
  function sparks(x, y, dir = 0, n = 4) {
    for (let i = 0; i < n; i++) {
      const base = dir > 0 ? 0 : dir < 0 ? Math.PI : -Math.PI / 2;
      const ang = base + (i / (n - 1) - 0.5) * 1.8 + (rnd() - 0.5) * 0.3, sp = 22 + rnd() * 10;
      spawn({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.6, life: 0.16 + rnd() * 0.08, ch: "Y" });
    }
  }
  const dust = (x, y, dir) => spawn({ x, y, vx: dir * (2 + rnd() * 3), vy: -(1 + rnd() * 2), g: -2, life: 0.3 + rnd() * 0.15, ch: "P" });
  const sweat = (x, y, dir) => spawn({ x, y, vx: dir * (4 + rnd() * 3), vy: -(3 + rnd() * 3), g: 40, life: 0.55, ch: "S" });
  function confetti(n) {
    const colors = ["Y", "V", "S", "L"];
    for (let i = 0; i < n; i++) spawn({ x: rnd() * SCENE_W, y: -1 - rnd() * 4, vx: (rnd() - 0.5) * 4, vy: 2 + rnd() * 4, g: 5, life: 1.8 + rnd() * 1.2, ch: colors[i % 4], sway: rnd() * TAU });
  }

  // st: lo que devuelve engine.snapshot()
  function update(now, st) {
    const target = st.taps / tapsPerRep;
    if (a.t === null) {
      a.t = now; a.last = { mode: st.mode, exercise: st.exercise }; a.modeAt = now;
      a.rep.x = target; a.impacts = impactsAt(target, st.exercise); a.walk.x = st.taps * 2;
      a.nextBlink = now + 1800 + rnd() * 1500; a.nextLook = now + 3500;
    }
    const dt = clamp((now - a.t) / 1000, 0, 0.1);
    a.t = now;
    const t = now;
    a.squash *= Math.exp(-dt / 0.09);           // antes de los eventos: un golpe nuevo se ve entero

    if (st.exercise !== a.last.exercise) {
      a.rep = { x: 0, v: 0 }; a.walk = { x: 0, v: 0 }; a.hopAt = t; a.impacts = impactsAt(0, st.exercise);
      dust(X - 1, GROUND - 1, -1); dust(X + 14, GROUND - 1, 1);
    }
    if (st.mode !== a.last.mode) {
      a.modeAt = t;
      if (st.mode === "festejo") confetti(28);
    }
    a.last = { mode: st.mode, exercise: st.exercise };

    if (still) { a.rep.x = st.taps % 2 ? target - 1 + impactAt(st.exercise) : target; a.impacts = impactsAt(a.rep.x, st.exercise); }
    else follow(target, dt, st.exercise);
    spring(a.walk, st.taps * 2, dt, 14, 1);

    const n = impactsAt(a.rep.x, st.exercise);
    if (n > a.impacts) {
      a.impacts = n; a.squash = 1;
      for (const [x, y, dir] of effortPoints(st.exercise)) sparks(x, y, dir);
    }
    a.tempo += (st.tempo - a.tempo) * (1 - Math.exp(-dt / 0.25));
    a.tail += dt * TAU * (1.1 + 0.55 * Math.min(a.tempo, 8));

    if (t >= a.nextBlink) { a.blinkUntil = t + 120; a.nextBlink = t + 2400 + rnd() * 2600; }
    if (st.mode === "reposo" && t >= a.nextLook) { a.lookTarget = rnd() < 0.5 ? -1 : 1; a.lookUntil = t + 700; a.nextLook = t + 3000 + rnd() * 3000; }
    if (t > a.lookUntil) a.lookTarget = st.mode === "entrenando" && st.exercise === "crabwalk" ? 1 : 0;
    a.look += (a.lookTarget - a.look) * (1 - Math.exp(-dt / 0.06));

    if (st.mode === "entrenando" && a.tempo >= 4.5 && t >= a.nextSweat) {
      const side = rnd() < 0.5 ? -1 : 1;
      sweat(side < 0 ? X - 2 : X + 14, Y + 1, side); a.nextSweat = t + 450;
    }
    if (st.mode === "cansado" && t >= a.nextDrip) {
      const side = rnd() < 0.5 ? -1 : 1;
      spawn({ x: side < 0 ? X - 2 : X + 14, y: Y + 2, vx: side * 1.5, vy: 0, g: 26, life: 0.7, ch: "S" }); a.nextDrip = t + 900;
    }
    if (st.mode === "festejo" && t >= a.nextConfetti) { confetti(3); a.nextConfetti = t + 220; }

    for (const p of a.particles) {
      p.vy += p.g * dt; p.x += p.vx * dt + (p.sway !== undefined ? Math.sin(t / 160 + p.sway) * 1.2 * dt : 0); p.y += p.vy * dt; p.life -= dt;
    }
    a.particles = a.particles.filter((p) => p.life > 0 && p.y < GROUND + 1 && p.x > -2 && p.x < SCENE_W + 2);
  }

  // Dónde saltan las chispas en cada ejercicio: [x, y, dir].
  function effortPoints(ex) {
    switch (ex) {
      case "curl": return [[X - 8, Y + 6, -1], [X + 21, Y + 6, 1]];
      case "sentadillas": return [[X - 2, GROUND - 1, -1], [X + 14, GROUND - 1, 1]];
      case "press": return [[X - 10, Y + 4, -1], [X + 22, Y + 4, 1]];
      case "dominadas": return [[X - 2, 1, -1], [X + 14, 1, 1]];
      case "soga": return [[X - 1, GROUND - 1, -1], [X + 14, GROUND - 1, 1]];
      case "crabwalk": { const x = walkerX(a.walk.x); return [[x - 2, GROUND - 1, -1]]; }
      default: return [[X - 1, GROUND - 1, 0]];
    }
  }

  function draw(cv, st) {
    clear(cv);
    const t = a.t ?? 0;
    const blink = t < a.blinkUntil;
    const breath = (1 - Math.cos(TAU * (t / 2600))) / 2;
    const tail = { side: 1, phase: a.tail, amp: 0.35 + 0.12 * Math.min(a.tempo, 8) };
    const hopT = (t - a.hopAt) / 350, hop = hopT >= 0 && hopT < 1 ? Math.sin(Math.PI * hopT) * 2 : 0;

    if (st.mode === "entrenando") EX[st.exercise]?.(cv, { a, t, blink, breath, tail, hop });
    else if (st.mode === "cansado") cansado(cv, { a, t, blink, tail });
    else if (st.mode === "festejo") festejo(cv, { a, t, tail });
    else reposo(cv, { a, t, blink, breath, tail });

    for (const p of a.particles) particle(cv, p);
  }

  return { update, draw, state: a };
}

// Sale por la derecha y vuelve a entrar por la izquierda.
function walkerX(dist) {
  const span = SCENE_W + 18;
  return ((((X + dist + 9) % span) + span) % span) - 9;
}

const eyeFor = (l, blink, hard = 0.72) => (l > hard ? "effort" : blink ? "closed" : "open");

// p: punto de la repetición (0..1); l: altura (0..1).
const EX = {
  curl(cv, { a, blink, tail, hop }) {
    const p = frac(a.rep.x), l = lift(p);
    const y = Y - hop;
    shadow(cv, X + 6.5, hop);
    clawd(cv, { x: X, y, sq: a.squash * 0.8, eye: eyeFor(l, blink), tail });
    const ny = lerp(Y + 6, Y, l) - hop, out = Math.sin(Math.PI * l) * 1.2;
    dumbbell(cv, X - 5 - out, ny); dumbbell(cv, X + 16 + out, ny);
  },

  sentadillas(cv, { a, blink, tail, hop }) {
    const p = frac(a.rep.x), l = lift(p), d = l * 2.2;
    const y = Y + d - hop;
    shadow(cv, X + 6.5, hop);
    clawd(cv, { x: X, y, sq: a.squash * 0.8 + l * 0.6, eye: eyeFor(l, blink), legLen: Math.max(0, 2 - d) + 0.01, splay: l * 1.2, tail });
    const ny = y + lerp(4, 0.5, l);
    nub(cv, X - 2 - l * 0.5, ny); nub(cv, X + 13 + l * 0.5, ny);
  },

  press(cv, { a, blink, tail }) {
    const p = frac(a.rep.x), l = lift(Math.max(0, p - PRESS_DIP) / (1 - PRESS_DIP));
    const dip = p < PRESS_DIP ? Math.sin(Math.PI * p / PRESS_DIP) * 0.9 : 0;
    const stretch = Math.max(0, l - 0.8) * 4;     // 0..0.8 en la extensión
    const y = Y + dip - stretch;
    shadow(cv, X + 6.5);
    clawd(cv, { x: X, y, sq: a.squash * 0.8 + dip * 0.6 - stretch * 0.6, eye: l < 0.35 ? (blink ? "closed" : "open") : l < 0.72 ? "half" : "effort", legLen: 2 - dip + stretch, tail });
    const by = lerp(Y + 4 + dip, Y - 4, l);
    barbell(cv, by, X - 9, X + 21);
    nub(cv, X - 2, by); nub(cv, X + 13, by);
  },

  crabwalk(cv, { a, blink }) {
    const dist = a.walk.x, x = walkerX(dist);
    const step = Math.floor(dist / 1.5) % 4;
    const legs = ["left", "both", "right", "both"][step];
    const moving = Math.abs(a.walk.v) > 0.8;
    const bob = moving && legs !== "both" ? 1 : 0;
    shadow(cv, x + 6.5, bob);
    clawd(cv, { x, y: Y - bob, eye: blink ? "closed" : "open", look: 1, legs: moving ? legs : "both", legLen: 2 + bob, tail: { side: -1, phase: a.tail * 1.4, amp: 0.4 + Math.min(Math.abs(a.walk.v), 12) * 0.08 } });
    nub(cv, x - 2, Y - bob + 4); nub(cv, x + 13, Y - bob + 4);
    if (moving && legs !== "both" && Math.floor(dist * 4) % 3 === 0) fill(cv, x - 3, GROUND - 1, 1, 1, "P");
  },

  dominadas(cv, { a, blink, tail }) {
    const p = frac(a.rep.x), l = lift(p);
    fill(cv, 3, 1, 35, 1, "d"); fill(cv, 3, 1, 2, 15, "K"); fill(cv, 36, 1, 2, 15, "K");
    const y = lerp(7, 3, l);
    nub(cv, X - 1, 0); nub(cv, X + 12, 0);
    clawd(cv, { x: X, y, sq: a.squash * 0.6 - (1 - l) * 0.3, eye: l > 0.9 ? "happy" : eyeFor(l, blink, 0.5), legLen: 2 + (1 - l) * 0.6, tail });
  },

  soga(cv, { a, blink, tail }) {
    const th = TAU * a.rep.x;
    const jump = Math.pow(Math.max(0, -Math.cos(th)), 0.8) * 2.6;
    const y = Y - jump;
    // la soga es una U entre las pinzas que pasa por arriba o por abajo de Clawd
    const hy = y + 4.5, lx = X - 2, rx = X + 14;
    const sag = Math.cos(th) > 0 ? -Math.cos(th) * (hy + 0.5) : -Math.cos(th) * (GROUND - 0.5 - hy);
    const rope = () => {
      const step = 1 / cv.s;
      let prev = null;
      for (let c = lx; c <= rx + 1e-9; c += step) {
        const k = (c - (lx + rx) / 2) / ((rx - lx) / 2), ry = hy + sag * (1 - k ** 4);
        // une con la fila anterior para que la soga no quede cortada
        const top = prev === null ? ry : Math.min(prev, ry), bot = prev === null ? ry : Math.max(prev, ry);
        fill(cv, c, top, step, Math.max(bot - top, 0) + (cv.s === 1 ? 1 : 0.5), "R");
        prev = ry;
      }
    };
    shadow(cv, X + 6.5, jump);
    const front = Math.sin(th) > 0;
    if (!front) rope();
    clawd(cv, { x: X, y, sq: a.squash * 0.8 - jump * 0.15, eye: jump > 1.5 ? "happy" : blink ? "closed" : "open", tail });
    if (front) rope();
    nub(cv, X - 2, y + 4); nub(cv, X + 13, y + 4);
  },
};

// Las pinzas siguen la respiración con un poco de retraso.
function reposo(cv, { a, t, blink, breath, tail }) {
  const y = Y - breath * 0.6;
  const lag = (1 - Math.cos(TAU * ((t - 220) / 2600))) / 2;
  shadow(cv, X + 6.5);
  clawd(cv, { x: X, y, eye: blink ? "closed" : "open", look: a.look, legLen: 2 + breath * 0.6, tail });
  nub(cv, X - 2, Y + 4 - lag * 0.6); nub(cv, X + 13, Y + 4 - lag * 0.6);
}

function cansado(cv, { a, t, tail }) {
  const b = (1 - Math.cos(TAU * (t / 1400))) / 2;
  shadow(cv, X + 6.5);
  clawd(cv, { x: X, y: Y + 1, sq: b * 0.7, eye: "half", legLen: 1, tail: { ...tail, amp: 0.2 } });
  nub(cv, X - 2 - b * 0.4, Y + 7 - b * 0.4); nub(cv, X + 13 + b * 0.4, Y + 7 - b * 0.4);
}

function festejo(cv, { a, t, tail }) {
  const k = frac((t - a.modeAt) / 900);
  let h = 0, sq = 0;
  if (k < 0.15) sq = Math.sin(Math.PI * k / 0.15) * 1.2;                        // amague
  else if (k < 0.6) { const u = (k - 0.15) / 0.45; h = Math.sin(Math.PI * u) * 3.5; sq = -0.8 * Math.sin(Math.PI * u); } // vuelo
  else if (k < 0.72) sq = Math.sin(Math.PI * (k - 0.6) / 0.12) * 1.2;           // aterrizaje
  const y = Y - h;
  shadow(cv, X + 6.5, h);
  clawd(cv, { x: X, y, sq, eye: "happy", legLen: 2 + Math.max(0, -sq) * 0.5, tail: { ...tail, amp: 0.4 + h * 0.2 } });
  if (h > 0.6) { nub(cv, X - 4, y - 2); nub(cv, X + 15, y - 2); }                // pinzas en V
  else { nub(cv, X - 2, y + 1 + sq * 0.5); nub(cv, X + 13, y + 1 + sq * 0.5); }
  for (const [sx, sy, ph] of [[3, 3, 0], [37, 2, 1.3], [5, 9, 2.1], [35, 8, 0.7]]) if (Math.sin(t / 140 + ph) > 0.2) fill(cv, sx, sy, 1, 1, "Y");
}

export const EXERCISE_IDS = Object.keys(EX);
