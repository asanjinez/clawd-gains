// Clawd Gains: Clawd entrena arriba del prompt mientras Claude trabaja.

import { CONFIG } from "../config.mjs";
import { createEngine } from "../lib/engine.mjs";
import { createAnimator } from "../lib/motion.mjs";
import { createCanvas, toCells, toPNG } from "../lib/canvas.mjs";
import { SCENE_W, SCENE_H, CLAWD_TEXT, CLAWD_TEXT_UP } from "../lib/parts.mjs";
import { STRINGS, DEFAULT_FOCUS_KEYS, pickLang, plural } from "../lib/i18n.mjs";
import { MINI_SEQ, MINI_BYE, seqTotal, poseAt, miniRows } from "../lib/mini.mjs";
import { createHoldFilter } from "../lib/hold.mjs";

const HOLD_HINT_MS = 1500;        // cuánto queda el aviso de "no mantengas"

const PANE = "clawd-gains";
const STATS_KEY = "stats";
const MODE_KEY = "mode";
const SCENE_KEY = "clawd";
const SCENE_ROWS = SCENE_H / 2;   // 2 píxeles por fila
const FRAME_MS = 33;              // ~30 cuadros por segundo
const HD_SCALE = 10;              // subpíxeles por píxel en el PNG
const HUD_COLUMNS = 38;           // ancho de los contadores
const BAR_CELLS_MAX = 20;
const SPARK = "▁▂▃▄▅▆▇█";
const MISSES_MAX = 6;             // blits fallidos seguidos antes de volver a montar la escena
const INVITE_MIN_MS = 5000;       // tiempo mínimo en pantalla de la invitación

const MODES = ["subtle", "always", "off"];
const MODE_ALIASES = { subtle: "subtle", discreto: "subtle", always: "always", siempre: "always", off: "off", apagado: "off" };

let cfg = CONFIG;
let KEY = "x";
let T = STRINGS.en;

// Se pierde al recargar el mod; las estadísticas y el modo se guardan en $.store.
const m = {
  engine: null,
  anim: null,
  canvases: {},          // uno por escala
  loaded: false,
  detected: false,
  canDraw: true,         // false en `claude -p`, SDK, etc.
  hd: false,             // kitty o Ghostty
  hdFailed: false,       // no se pudo montar el PNG
  plain: false,          // NO_COLOR, FORCE_COLOR=0, TERM=dumb
  reduced: false,        // prefersReducedMotion
  focusKeys: DEFAULT_FOCUS_KEYS, // atajo de abovePrompt:focus
  mode: "subtle",        // subtle | always | off
  level: "none",         // none | invite | gym
  loop: null,
  busy: false,
  site: null,            // requestId donde está montada la escena
  siteScale: 1,
  sent: null,            // último cuadro enviado
  misses: 0,
  hudSig: "",
  pose: -1,              // última pose dibujada del Clawd chico
  turnStartedAt: 0,
  inviteShownAt: 0,      // 0 si todavía no apareció en este turno
  byeAt: 0,
  byeUntil: 0,
  typing: false,         // hay texto en el prompt
  celebrateUntil: 0,
  hold: createHoldFilter(),
  heldUntil: 0,
  dialog: false,         // hay (o va a haber) un diálogo
  calls: 0,              // herramientas en curso
  closeTimer: null,
  hideTimer: null,
  inviteTimer: null,
  // panel de /gains
  paneOpen: false,
  autoOpened: false,
  hiddenForDialog: false,
  restoreAuto: false,
  warnedNarrow: false,
};

export function register(on, options = {}) {
  cfg = { ...CONFIG, ...(options?.config ?? {}) };   // para los tests
  KEY = /^[a-z0-9]$/.test(cfg.key ?? "") ? cfg.key : "x";
  T = STRINGS[cfg.lang === "es" ? "es" : "en"];

  on("session.start", async ($, e, next) => {
    const r = await next(e);
    m.canDraw = e.isInteractive !== false;
    await ensure($);
    m.engine.state.stats.sessions++;
    await saveStats($);
    try {
      await $.command.register({ name: "gains", description: T.command, argumentHint: "[subtle|always|off|stats]", immediate: true });
    } catch (err) { $.ui.log(`clawd-gains: /gains not registered: ${err?.message ?? err}`, { to: "debug" }); }
    return r;
  });

  on("command.run", { command: "gains" }, async ($, e) => {
    await ensure($);
    const arg = (e.args ?? "").trim().toLowerCase();
    if (arg === "stats") return { text: T.stats(m.engine.state, plural) };
    if (arg === "reset") { m.engine.resetRecord(); await saveStats($); return { text: T.reset(m.engine.state.stats.record) }; }
    if (arg === "close" || arg === "cerrar") { await closePane($); return {}; }
    if (MODE_ALIASES[arg]) {
      m.mode = MODE_ALIASES[arg];
      try { await $.store.set(MODE_KEY, m.mode); } catch { /* el modo vale para esta sesión */ }
      if (m.mode === "subtle") scheduleInvite($, await $.clock.now());
      $.ui.invalidate("ui.render");
      return { text: modeText() };
    }
    if (arg === "help" || arg === "ayuda" || arg === "mode" || arg === "modo") return { text: `${modeText()} ${T.modeHelp}` };
    await openPane($, { manual: true });
    return {};
  });

  on("turn.start", async ($, e, next) => {
    if (!e.agentId) {
      await ensure($);
      const now = await $.clock.now();
      m.engine.startTurn(now);
      m.turnStartedAt = now;
      m.inviteShownAt = 0;
      m.byeUntil = 0;
      m.typing = false;
      cancelTimers();
      m.celebrateUntil = 0;
      scheduleInvite($, now);
      if (place() === "panel" && cfg.autoOpen !== false && m.canDraw) await openPane($, { manual: false });
      $.ui.invalidate("ui.render");
    }
    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const r = await next(e);
    if (!e.agentId) {
      await ensure($);
      const now = await $.clock.now();
      const summary = m.engine.endTurn(now);
      await saveStats($);
      cancelTimers();
      const stay = summary.repsTurn > 0 && m.mode !== "off" ? (cfg.celebrateMs ?? 3000) + 400 : 0;
      m.celebrateUntil = now + stay;
      if (!stay && m.inviteShownAt && m.mode === "subtle") {
        m.byeAt = now;
        m.byeUntil = Math.max(now + BYE_TOTAL, m.inviteShownAt + INVITE_MIN_MS);
      }
      const until = Math.max(m.celebrateUntil, m.byeUntil);
      if (until > now) m.hideTimer = $.clock.after(until - now + 60, () => $.ui.invalidate("ui.render"));
      if (m.paneOpen && m.autoOpened) m.closeTimer = $.clock.after(stay + 400, () => closePane($));
      $.ui.invalidate("ui.render");
    }
    return r;
  });

  // Clawd se esconde mientras escribís.
  on("prompt.edit", async ($, e, next) => {
    const r = await next(e);
    const typing = (r?.text ?? "").length > 0;
    if (typing !== m.typing) { m.typing = typing; $.ui.invalidate("ui.render"); }
    return r;
  });

  on("prompt.submit", async ($, e, next) => {
    if (m.typing) { m.typing = false; $.ui.invalidate("ui.render"); }
    return next(e);
  });

  // La tecla se desactiva antes de que aparezca un diálogo: el de permisos o el
  // de AskUserQuestion. Se da por cerrado cuando no queda ninguna herramienta
  // en curso.
  on("tool.call", async ($, e, next) => {
    m.calls++;
    try {
      if (e.tool === "AskUserQuestion" || await willAsk($, e)) await dialogOpens($);
      return await next(e);
    } finally {
      m.calls = Math.max(0, m.calls - 1);
      if (m.calls === 0 && m.dialog) {
        m.dialog = false;
        if (m.hiddenForDialog) await restoreAfterDialog($);
        $.ui.invalidate("ui.render");
      }
    }
  });

  on("ui.render", { component: "Spinner" }, async ($, e, next) => {
    const reps = m.engine?.state.repsSession ?? 0;
    if (!reps) return next(e);
    return next({ ...e, props: { ...e.props, suffix: ` · 💪 ${plural(reps)}…` } });
  });

  // La banda se comparte con otros mods y con las encuestas.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (place() !== "abajo" || !m.canDraw) return next(e);
    await ensure($);
    const now = await $.clock.now();
    const level = e.props?.hasSurvey ? "none" : bandLevel(now, e.props?.isWorking);
    m.level = level;
    if (level !== "gym" && m.site === e.requestId) { m.site = null; m.sent = null; }
    if (level === "none") { if (!m.paneOpen) stopLoop(); return next(e); }
    const theirs = await next(e);
    let view;
    if (level === "gym") view = gymView($, e, now);
    else {
      if (!m.inviteShownAt) m.inviteShownAt = now;
      view = inviteView($, e, now);
      if (!m.reduced) startLoop($);
    }
    return theirs ? $.ui.resolve(e).Box({ flexDirection: "column", children: [view, theirs] }) : view;
  });

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e);
    await ensure($);
    return paneView($, e, await $.clock.now());
  });

  on("ui.close", async ($, e, next) => {
    if (e.id === PANE || e.requestId === PANE) {
      m.paneOpen = false;
      if (m.site === PANE) { m.site = null; m.sent = null; }
      if (e.origin?.kind === "person") { m.autoOpened = false; m.hiddenForDialog = false; }
      $.ui.invalidate("ui.render");
    }
    return next(e);
  });
}

const place = () => (cfg.place === "panel" ? "panel" : "abajo");

function bandLevel(now, isWorking) {
  if (m.mode === "off" || m.paneOpen) return "none";
  const st = m.engine.state;
  if (now < m.celebrateUntil) return "gym";
  if (m.typing) return "none";
  if (now < m.byeUntil) return "invite";
  if (!(isWorking || st.turnActive)) return "none";
  const training = st.mode === "entrenando" || st.mode === "cansado";
  if (m.mode === "always" || training) return "gym";
  if (m.dialog) return "none";                                          // no invitar con un diálogo abierto
  return now - m.turnStartedAt >= (cfg.inviteAfterMs ?? 2000) ? "invite" : "none";
}

// Igual que bandLevel, para el bucle (que no tiene las props del render).
function loopLevel(now) {
  if (m.paneOpen) return "gym";
  return place() === "panel" ? "none" : bandLevel(now, false);
}

function scheduleInvite($, now) {
  if (m.inviteTimer) { m.inviteTimer.cancel(); m.inviteTimer = null; }
  if (m.mode !== "subtle" || !m.engine.state.turnActive) return;
  const wait = Math.max(0, (cfg.inviteAfterMs ?? 2000) - (now - m.turnStartedAt));
  m.inviteTimer = $.clock.after(wait + 20, () => $.ui.invalidate("ui.render"));
}

const modeText = () => T.modeLine(T.modeName[m.mode], T.modeWhat[m.mode]);

const MINI_TOTAL = seqTotal(MINI_SEQ);
const BYE_TOTAL = seqTotal(MINI_BYE);

// Devuelve [secuencia, índice].
function miniPose(now) {
  if (m.reduced) return [MINI_SEQ, 0];
  if (now < m.byeUntil) return [MINI_BYE, poseAt(MINI_BYE, now - m.byeAt, false)];
  return [MINI_SEQ, poseAt(MINI_SEQ, now - m.turnStartedAt)];
}

function miniClawd(ui, [seq, i]) {
  const { Box, Text } = ui;
  const [eyes, arms] = seq[i];
  const part = (r, k, p) => Text({ key: `${r}${k}`, color: p.lid ? "clawd_background" : "clawd_body", ...(p.lid ? { backgroundColor: "clawd_body" } : p.eye ? { backgroundColor: "clawd_background" } : {}), children: p.text });
  return Box({ key: "mini", flexDirection: "column", width: 9, children: miniRows(eyes, arms).map((row, r) =>
    Box({ key: `r${r}`, flexDirection: "row", children: row.map((p, k) => part(r, k, p)) })) });
}

function inviteView($, e, now) {
  const ui = $.ui.resolve(e);
  const { Box, Text, Button } = ui;
  const st = m.engine.state;
  const pose = miniPose(now);
  m.pose = poseKey(pose);
  const bye = now < m.byeUntil;
  return Box({ key: "invite", flexDirection: "row", children: [
    miniClawd(ui, pose),
    Box({ key: "say", flexDirection: "column", marginLeft: 2, children: [
      Text({ key: "t1", bold: true, color: "clawd_body", children: bye ? T.bye : T.invite }),
      bye
        ? Text({ key: "t2", children: " " })
        : Box({ key: "t2", flexDirection: "row", children: [
          Text({ key: "how", dimColor: true, children: T.start(m.focusKeys) }),
          Button({ key: "tap", label: T.train, hotkey: KEY, plain: true, onPress: () => onTap($) }),
        ] }),
      Text({ key: "t3", dimColor: true, children: st.stats.record > 0 ? T.recordLine(st.stats.record) : " " }),
    ] }),
  ] });
}

const poseKey = ([seq, i]) => (seq === MINI_BYE ? 100 + i : i);

function gymView($, e, now) {
  const ui = $.ui.resolve(e);
  const { Box } = ui;
  const columns = e.props?.bodyColumns ?? 80, rows = e.props?.maxRows ?? SCENE_ROWS;
  if (rows < SCENE_ROWS || columns < SCENE_W) return compactLine(ui, $, now);
  const scene = sceneElement($, e, ui, now, 1);
  const hud = hudRows(ui, $, now, { hint: T.escBand });
  if (columns >= SCENE_W + 2 + HUD_COLUMNS) {
    return Box({ key: "gains", flexDirection: "row", children: [
      scene,
      Box({ key: "hud", flexDirection: "column", justifyContent: "center", marginLeft: 2, height: SCENE_ROWS, width: HUD_COLUMNS, children: hud }),
    ] });
  }
  return Box({ key: "gains", flexDirection: "column", children: [scene, compactLine(ui, $, now)] });
}

function paneView($, e, now) {
  const ui = $.ui.resolve(e);
  const { Box } = ui;
  const focused = e.props?.isFocused !== false;
  const hint = focused ? T.escPane : T.paneIdle;
  const cols = e.props?.bodyColumns ?? 80;
  const scene = sceneElement($, e, ui, now, 1);
  const hud = hudRows(ui, $, now, { hint });
  if (cols >= SCENE_W + 2 + HUD_COLUMNS) {
    return Box({ key: "gains", flexDirection: "row", paddingX: 1, children: [
      scene,
      Box({ key: "hud", flexDirection: "column", justifyContent: "center", marginLeft: 2, height: SCENE_ROWS, width: HUD_COLUMNS, children: hud }),
    ] });
  }
  return Box({ key: "gains", flexDirection: "column", paddingX: 1, children: [scene, ...hud] });
}

// PNG en kitty y Ghostty, medios bloques en otras terminales y el Clawd chico
// de texto fuera de la terminal o sin colores.
function sceneElement($, e, ui, now, scale) {
  const { Box, Text, Raster, Image } = ui;
  if (e.surface !== "terminal" || m.plain) {
    const rows = m.engine.state.mode === "festejo" ? CLAWD_TEXT_UP : CLAWD_TEXT;
    return Box({ key: "scene", flexDirection: "column", children: rows.map((row, i) => Text({ key: `c${i}`, color: "clawd_body", children: row })) });
  }
  const hd = m.hd && !m.hdFailed;
  const cv = canvas(hd, scale);
  if (!m.loop || m.site !== e.requestId || m.siteScale !== scale) { const st = m.engine.snapshot(now); m.anim.update(now, st); m.anim.draw(cv, st); }
  m.site = e.requestId;
  m.siteScale = scale;
  m.misses = 0;
  if (!m.reduced) startLoop($);
  const columns = SCENE_W * scale, rows = SCENE_ROWS * scale;
  if (hd) {
    m.sent = toPNG(cv);
    return Image({ key: SCENE_KEY, source: { png: m.sent }, columns, rows, alt: T.alt });
  }
  m.sent = toCells(cv);
  return Raster({ key: SCENE_KEY, columns, rows, cells: m.sent });
}

function hudRows(ui, $, now, { hint }) {
  const { Box, Text, Button } = ui;
  const st = m.engine.state, c = m.engine.config;
  const exId = m.engine.exercise();
  const name = (T.exercises[exId] ?? exId).toUpperCase();

  let title = name, titleColor = "clawd_body";
  let aside = Text({ key: "set", dimColor: true, children: `${st.repsInSet}/${c.repsPerSet}` });
  if (st.mode !== "festejo" && now < m.heldUntil) aside = Text({ key: "aside", color: "warning", children: T.hold });
  else if (st.mode === "cansado") aside = Text({ key: "aside", color: "warning", children: T.tired(KEY) });
  else if (st.mode === "festejo") {
    const s = st.lastSummary;
    title = s?.isRecord ? T.record : T.nice;
    titleColor = "success";
    aside = Text({ key: "aside", color: "success", children: T.thisTurn(plural(s?.repsTurn ?? 0)) });
  } else if (st.mode === "reposo" && st.lastSummary) aside = Text({ key: "aside", dimColor: true, children: T.lastTurn(plural(st.lastSummary.repsTurn)) });

  const cells = Math.min(c.repsPerSet, BAR_CELLS_MAX);
  const filled = Math.round((st.repsInSet / c.repsPerSet) * cells);
  const dots = Array.from({ length: c.tapsPerRep }, (_, k) => (k < st.tapsTowardRep ? "●" : "○")).join("");
  const tempo = m.engine.tempo(now);
  const spark = tempo.map((n) => SPARK[Math.min(n, SPARK.length - 1)]).join("");
  const perSec = tempo.reduce((a, b) => a + b, 0) / 2;
  const hot = perSec >= 4.5;
  const record = st.stats.record;
  const atRecord = record > 0 && st.repsSession >= record;

  const control = m.dialog
    ? Text({ key: "wait", color: "warning", children: T.wait })
    : Box({ key: "keys", flexDirection: "row", gap: 1, children: [
      Button({ key: "tap", label: T.train, hotkey: KEY, plain: true, onPress: () => onTap($) }),
      Text({ key: "hint", dimColor: true, children: `· ${hint}` }),
    ] });

  return [
    Box({ key: "title", flexDirection: "row", justifyContent: "space-between", width: HUD_COLUMNS, children: [
      Text({ key: "name", bold: true, color: titleColor, children: title }), aside,
    ] }),
    Box({ key: "meter", flexDirection: "row", gap: 2, children: [
      Box({ key: "bar", flexDirection: "row", children: [
        Text({ key: "on", color: "clawd_body", children: "━".repeat(filled) }),
        Text({ key: "off", dimColor: true, children: "─".repeat(cells - filled) }),
      ] }),
      ...(c.tapsPerRep > 1 ? [Text({ key: "dots", color: "clawd_body", children: dots })] : []),
    ] }),
    Box({ key: "tempo", flexDirection: "row", gap: 1, children: [
      Text({ key: "l", dimColor: true, children: T.pace }),
      Text({ key: "s", color: hot ? "success" : perSec > 0 ? "clawd_body" : undefined, dimColor: perSec === 0, children: spark }),
      ...(hot ? [Text({ key: "fire", color: "success", children: T.onFire })] : []),
    ] }),
    Box({ key: "counters", flexDirection: "row", children: [
      Text({ key: "c1", dimColor: true, children: T.counters(plural(st.repsSession)) }),
      Text({ key: "c2", dimColor: !atRecord, color: atRecord ? "success" : undefined, children: `${record}` }),
    ] }),
    control,
  ];
}

// Para bandas bajas o angostas.
function compactLine(ui, $, now) {
  const { Box, Text, Button } = ui;
  const st = m.engine.state, exId = m.engine.exercise();
  return Box({ key: "line", flexDirection: "row", gap: 1, children: [
    Text({ key: "who", color: "clawd_body", children: "💪" }),
    Text({ key: "what", bold: true, children: T.exercises[exId] ?? exId }),
    Text({ key: "count", dimColor: true, children: `${st.repsInSet}/${m.engine.config.repsPerSet} · ${plural(st.repsSession)}` }),
    m.dialog ? Text({ key: "wait", color: "warning", children: "⏸" }) : Button({ key: "tap", label: T.train, hotkey: KEY, plain: true, onPress: () => onTap($) }),
  ] });
}

// La escena se repinta con $.ui.blit sin volver a pasar por el render; la
// invitación y los contadores, solo cuando cambian.

function startLoop($) {
  if (m.loop) return;
  m.loop = $.clock.every(FRAME_MS, () => void frame($));
}

function stopLoop() {
  if (m.loop) { try { m.loop.cancel(); } catch { /* nada */ } m.loop = null; }
}

async function frame($) {
  if (m.busy) return;
  m.busy = true;
  try {
    const now = await $.clock.now();
    const changed = m.engine.tick(now);
    const level = loopLevel(now);
    const shown = m.paneOpen ? "gym" : m.level;
    if (level !== shown) {
      m.level = level;
      if (level !== "gym") { m.site = null; m.sent = null; }
      if (level === "none") stopLoop();
      $.ui.invalidate("ui.render");
      return;
    }
    if (level === "invite") {
      if (poseKey(miniPose(now)) !== m.pose) $.ui.invalidate("ui.render");
      return;
    }
    if (level !== "gym" || !m.site) return;
    const st = m.engine.snapshot(now);
    const hd = m.hd && !m.hdFailed;
    const cv = canvas(hd, m.siteScale);
    m.anim.update(now, st);
    m.anim.draw(cv, st);
    const payload = hd ? toPNG(cv) : toCells(cv);
    if (payload !== m.sent) {
      const res = await $.ui.blit(hd ? { requestId: m.site, key: SCENE_KEY, source: { png: payload } } : { requestId: m.site, key: SCENE_KEY, cells: payload }).catch((err) => ({ deny: String(err?.message ?? err) }));
      if (res?.deny === undefined) { m.sent = payload; m.misses = 0; }
      else if (++m.misses >= MISSES_MAX) {
        // la escena se desmontó; si era el PNG, se pasa a medios bloques
        if (hd) { m.hdFailed = true; $.ui.log(`clawd-gains: image not mounted (${res.deny}); using half blocks`, { to: "debug" }); }
        m.site = null; m.sent = null;
        $.ui.invalidate("ui.render");
        return;
      }
    }
    const sig = hudSignature(now);
    if (changed || sig !== m.hudSig) { m.hudSig = sig; $.ui.invalidate("ui.render"); }
  } catch (err) {
    $.ui.log(`clawd-gains: frame failed: ${err?.message ?? err}`, { to: "debug" });
  } finally {
    m.busy = false;
  }
}

function hudSignature(now) {
  const s = m.engine.state;
  return [s.mode, m.engine.exercise(), s.repsInSet, s.tapsTowardRep, s.repsTurn, s.repsSession, s.stats.record, m.engine.tempo(now).join(""), m.dialog, now < m.heldUntil].join("|");
}

function canvas(hd, scale = 1) {
  const s = (hd ? HD_SCALE : 1) * scale;
  return (m.canvases[s] ??= createCanvas(SCENE_W, SCENE_H, s));
}

async function onTap($) {
  if (m.dialog) return;
  const now = await $.clock.now();
  if (m.hold.accept(now)) m.engine.tap(now);
  else m.heldUntil = now + HOLD_HINT_MS;       // tecla sostenida: no cuenta
  $.ui.invalidate("ui.render");
}

async function dialogOpens($) {
  m.dialog = true;
  if (m.paneOpen) await hideForDialog($);
  $.ui.invalidate("ui.render");
}

// $.tool.check solo consulta: no ejecuta nada ni abre el diálogo.
async function willAsk($, e) {
  const { tool, tool_use_id, agentId, consent, ...input } = e;
  try { return (await $.tool.check({ tool, input }))?.decision === "ask"; }
  catch (err) { $.ui.log(`clawd-gains: permission check failed: ${err?.message ?? err}`, { to: "debug" }); return false; }
}

async function openPane($, { manual }) {
  if (!m.canDraw) return;
  if (manual) cancelTimers();
  const wasOpen = m.paneOpen;
  let placed;
  try {
    placed = await $.ui.open({ id: PANE, title: "Clawd Gains", focus: true, closeOnEscape: true, rows: SCENE_ROWS + 1, columns: SCENE_W + HUD_COLUMNS + 6 });
  } catch (err) {
    $.ui.log(`clawd-gains: panel not opened: ${err?.message ?? err}`, { to: "debug" });
    return;
  }
  m.paneOpen = true;
  m.hiddenForDialog = false;
  if (!wasOpen) m.autoOpened = !manual;
  else if (manual) m.autoOpened = false;
  if (placed?.isPlaced === false && !manual && !m.warnedNarrow) {
    m.warnedNarrow = true;
    $.ui.toast(T.narrow);
  }
  $.ui.invalidate("ui.render");
}

async function closePane($) {
  if (!m.paneOpen) return;
  try { await $.ui.close({ id: PANE }); } catch { /* ya estaba cerrado */ }
  m.paneOpen = false;
  m.autoOpened = false;
}

async function hideForDialog($) {
  m.restoreAuto = m.autoOpened;
  m.hiddenForDialog = true;
  if (m.closeTimer) { m.closeTimer.cancel(); m.closeTimer = null; }
  try { await $.ui.close({ id: PANE }); } catch { /* ya estaba cerrado */ }
  m.paneOpen = false;
}

async function restoreAfterDialog($) {
  m.hiddenForDialog = false;
  if (!m.engine.state.turnActive) return;
  await openPane($, { manual: !m.restoreAuto });
}

function cancelTimers() {
  for (const k of ["closeTimer", "hideTimer", "inviteTimer"]) if (m[k]) { try { m[k].cancel(); } catch { /* nada */ } m[k] = null; }
}

// No alcanza con session.start: al recargar el mod en caliente, register()
// vuelve a correr pero session.start no siempre.
async function ensure($) {
  if (!m.loaded) {
    m.loaded = true;
    let stats, mode;
    try { stats = await $.store.get(STATS_KEY); } catch { stats = undefined; }
    try { mode = await $.store.get(MODE_KEY); } catch { mode = undefined; }
    m.mode = MODE_ALIASES[mode] ?? MODE_ALIASES[cfg.mode] ?? "subtle";
    m.engine = createEngine(cfg, stats ?? {});
    m.anim = createAnimator({ tapsPerRep: m.engine.config.tapsPerRep, seed: Date.now() % 100000 });
  }
  if (!m.detected) {
    m.detected = true;
    try { await detectSurface($); }
    catch (err) { $.ui.log(`clawd-gains: environment not detected: ${err?.message ?? err}`, { to: "debug" }); }
  }
}

// La API no dice si la terminal muestra imágenes: se deduce del entorno y,
// si el PNG no se monta, frame() pasa a medios bloques.
async function detectSurface($) {
  const env = {
    TMUX: await $.env.get("TMUX"), STY: await $.env.get("STY"),
    FORCE: await $.env.get("CLAUDE_CODE_FORCE_TERMINAL_IMAGES"),
    TERM_PROGRAM: await $.env.get("TERM_PROGRAM"), TERM: await $.env.get("TERM"),
    GHOSTTY: await $.env.get("GHOSTTY_RESOURCES_DIR"), KITTY: await $.env.get("KITTY_WINDOW_ID"),
    NO_COLOR: await $.env.get("NO_COLOR"), FORCE_COLOR: await $.env.get("FORCE_COLOR"),
    LANG: await $.env.get("LANG"),
  };
  let settings = {};
  try { settings = (await $.settings.read()) ?? {}; } catch { settings = {}; }

  T = STRINGS[pickLang({ lang: cfg.lang, language: settings.language, envLang: env.LANG })];

  m.plain = (env.NO_COLOR !== undefined && env.NO_COLOR !== "") || env.FORCE_COLOR === "0" || env.TERM === "dumb";
  if (cfg.hd === true) m.hd = true;
  else if (cfg.hd === false) m.hd = false;
  else m.hd = !env.TMUX && !env.STY && (Boolean(env.FORCE) || (env.TERM_PROGRAM ?? "").toLowerCase() === "ghostty" || Boolean(env.GHOSTTY) || Boolean(env.KITTY) || env.TERM === "xterm-kitty" || env.TERM === "xterm-ghostty");
  m.reduced = settings.prefersReducedMotion === true;
  if (m.reduced) m.anim = createAnimator({ tapsPerRep: m.engine.config.tapsPerRep, seed: 1, still: true });
  m.focusKeys = await focusKeys($);
  $.ui.log(`clawd-gains: lang=${T === STRINGS.es ? "es" : "en"} hd=${m.hd} focusKeys=${m.focusKeys}`, { to: "debug" });
}

// El atajo de abovePrompt:focus en keybindings.json, para mostrarlo en la invitación.
async function focusKeys($) {
  // en Windows, HOME puede faltar o venir con forma de Git Bash
  const config = await $.env.get("CLAUDE_CONFIG_DIR");
  const homes = [await $.env.get("HOME"), await $.env.get("USERPROFILE")].filter(Boolean);
  const dirs = [config, ...homes.map((h) => `${h}/.claude`)].filter(Boolean);
  for (const dir of dirs) {
    let json;
    try { json = JSON.parse(await $.fs.read(`${dir}/keybindings.json`)); }
    catch (err) { $.ui.log(`clawd-gains: no keybindings in ${dir}: ${err?.message ?? err}`, { to: "debug" }); continue; }
    for (const block of json?.bindings ?? []) {
      if (block?.context !== "Chat" && block?.context !== "Global") continue;
      for (const [keys, action] of Object.entries(block?.bindings ?? {})) if (action === "abovePrompt:focus") return keys;
    }
    break;   // el archivo existe pero no cambia el atajo
  }
  return DEFAULT_FOCUS_KEYS;
}

async function saveStats($) {
  try { await $.store.set(STATS_KEY, m.engine.state.stats); } catch (err) { $.ui.log(`clawd-gains: stats not saved: ${err?.message ?? err}`, { to: "debug" }); }
}
