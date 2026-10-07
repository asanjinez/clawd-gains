// Prueba los hooks con un $ falso, sin Claude Code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENE_W, SCENE_H } from "../lib/parts.mjs";

let seq = 0;

// Import nuevo por test: el estado del mod vive a nivel de módulo.
async function harness({ env = {}, config, settings = { language: "español" }, blit, stored = {}, files = {}, check = { decision: "allow" } } = {}) {
  const { register } = await import(`../hooks/clawd-gains.mjs?instance=${++seq}`);
  const hooks = [];
  const calls = [];
  let now = 1_000_000;
  const store = new Map(Object.entries(stored));
  const timers = [];

  const el = (type) => (props) => ({ type, props });
  const $ = {
    ui: {
      open: async (args) => { calls.push(["open", args]); return { isPlaced: true }; },
      close: async (args) => { calls.push(["close", args]); await fire("ui.close", { id: args.id, origin: { kind: "plugin" } }); },
      invalidate: (ev) => calls.push(["invalidate", ev]),
      resolve: () => ({ Box: el("Box"), Text: el("Text"), Button: el("Button"), Raster: el("Raster"), Image: el("Image") }),
      blit: async (args) => { calls.push(["blit", args]); return blit ? blit(args) : {}; },
      log: (text, o) => calls.push(["log", text, o]),
      toast: (text) => calls.push(["toast", text]),
    },
    clock: {
      now: async () => now,
      every: (ms, fn) => { const t = { ms, fn, cancelled: false, cancel() { this.cancelled = true; } }; timers.push(t); return t; },
      after: (ms, fn) => { const t = { ms, fn, at: now + ms, cancelled: false, cancel() { this.cancelled = true; } }; timers.push(t); return t; },
    },
    store: { get: async (k) => store.get(k), set: async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); } },
    env: { get: async (k) => env[k] },
    fs: { read: async (p) => { if (p in files) return files[p]; throw new Error(`ENOENT ${p}`); } },
    settings: { read: async () => settings },
    command: { register: async (spec) => calls.push(["command.register", spec]) },
    tool: { check: async (args) => { calls.push(["tool.check", args]); return check; } },
  };

  const on = (event, matcher, handler) => {
    if (handler === undefined) { handler = matcher; matcher = undefined; }
    hooks.push({ event, matcher, handler });
  };

  async function fire(event, e, nextResult = {}) {
    const matching = hooks.filter((h) => h.event === event && (!h.matcher || Object.entries(h.matcher).every(([k, v]) => e[k] === v)));
    let result = nextResult;
    for (const h of matching) {
      const next = async (ee) => { result = typeof nextResult === "function" ? await nextResult(ee ?? e) : nextResult; return result; };
      result = await h.handler($, e, next);
    }
    return result;
  }

  // Avanza el reloj de a 33 ms y corre los timers.
  async function advance(ms) {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 33);
      for (const t of [...timers]) {
        if (t.cancelled) continue;
        if (t.at !== undefined) { if (now >= t.at) { t.cancelled = true; await t.fn(); } }
        else await t.fn();
      }
      await new Promise((r) => setImmediate(r));
    }
  }

  const find = (tree, type, pred = () => true) => {
    if (!tree || typeof tree !== "object") return null;
    if (tree.type === type && pred(tree)) return tree;
    const kids = tree.props?.children;
    for (const k of Array.isArray(kids) ? kids : [kids]) { const f = find(k, type, pred); if (f) return f; }
    return null;
  };
  const all = (tree, out = []) => {
    if (!tree || typeof tree !== "object") return out;
    if (tree.type) out.push(tree);
    const kids = tree.props?.children;
    for (const k of Array.isArray(kids) ? kids : [kids]) all(k, out);
    return out;
  };
  const texts = (tree) => all(tree).filter((n) => n.type === "Text" && typeof n.props.children === "string").map((n) => n.props.children).join(" ");

  register(on, config ? { config } : {});
  return { $, calls, fire, advance, find, all, texts, store, timers, get now() { return now; } };
}

const band = (props = {}, extra = {}) => ({ component: "AbovePrompt", requestId: "band", surface: "terminal", props: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 115, ...props }, ...extra });
const start = async (h) => { await h.fire("session.start", { isInteractive: true, surface: "terminal" }); await h.fire("turn.start", { turnId: "t1", text: "hola" }); };
const tapButton = (h, tree) => h.find(tree, "Button", (b) => b.props.hotkey === "x");
const press = async (h, n = 1) => { for (let i = 0; i < n; i++) { if (i) await h.advance(120); await tapButton(h, await h.fire("ui.render", band(), null)).props.onPress(); } };
const SIEMPRE = { mode: "siempre" };

test("session.start registra /gains y guarda las estadísticas", async () => {
  const h = await harness();
  await h.fire("session.start", { isInteractive: true, surface: "terminal" });
  assert.equal(h.calls.find((c) => c[0] === "command.register")[1].name, "gains");
  assert.equal(h.store.get("stats").sessions, 1);
});

// Modo discreto

test("discreto: en un turno corto no aparece nada; si Claude tarda, invita el Clawd chico oficial", async () => {
  const h = await harness();
  await start(h);
  assert.deepEqual(await h.fire("ui.render", band(), { theirs: true }), { theirs: true }, "turno corto: la banda queda como está");
  await h.advance(8100);
  const invite = await h.fire("ui.render", band(), null);
  assert.equal(h.find(invite, "Raster"), null, "todavía no hay gimnasio");
  assert.match(h.texts(invite), /Entrená a Clawd/);
  assert.ok(tapButton(h, invite), "la tecla está para empezar");
  assert.ok(h.find(invite, "Box", (b) => b.props.key === "mini"), "el Clawd chico");
  assert.match(h.texts(invite), /█████/, "el cuerpo del Clawd chico");
});

test("discreto: el Clawd chico es el oficial: ojos sobre clawd_background, sin otros fondos", async () => {
  const h = await harness();
  await start(h);
  await h.advance(8100);
  const invite = await h.fire("ui.render", band(), null);
  const backgrounds = h.all(invite).filter((n) => n.props.backgroundColor !== undefined).map((n) => n.props.backgroundColor);
  assert.ok(backgrounds.length > 0);
  assert.ok(backgrounds.every((c) => c === "clawd_background" || c === "clawd_body"), `fondos: ${backgrounds}`);
});

test("discreto: al apretar x se agranda al gimnasio, y en reposo vuelve a la invitación", async () => {
  const h = await harness();
  await start(h);
  await h.advance(8100);
  await press(h);
  const gym = await h.fire("ui.render", band(), null);
  assert.ok(h.find(gym, "Raster"), "gimnasio");
  await h.advance(10_500);   // sin toques: cansado y después reposo
  const back = await h.fire("ui.render", band(), null);
  assert.equal(h.find(back, "Raster"), null);
  assert.match(h.texts(back), /Entrená a Clawd/);
});

test("discreto: si escribís en el prompt, Clawd se corre; con el prompt vacío, vuelve", async () => {
  const h = await harness();
  await start(h);
  await h.advance(8100);
  await h.fire("prompt.edit", { origin: { kind: "composer" }, text: "" }, { text: "h", cursor: 1 });
  assert.deepEqual(await h.fire("ui.render", band(), { theirs: true }), { theirs: true });
  await h.fire("prompt.edit", { origin: { kind: "composer" }, text: "h" }, { text: "", cursor: 0 });
  assert.match(h.texts(await h.fire("ui.render", band(), null)), /Entrená a Clawd/);
});

test("discreto: con un diálogo pendiente no invita", async () => {
  const h = await harness({ check: { decision: "ask" } });
  await start(h);
  await h.advance(8100);
  let during;
  await h.fire("tool.call", { tool: "Bash", command: "ls" }, async () => {
    during = await h.fire("ui.render", band(), { theirs: true });
    return { result: "ok" };
  });
  assert.deepEqual(during, { theirs: true });
  assert.match(h.texts(await h.fire("ui.render", band(), null)), /Entrená a Clawd/, "vuelve cuando termina");
});

test("discreto: festejo solo si entrenaste en el turno", async () => {
  const trained = await harness();
  await start(trained);
  await trained.advance(8100);
  await press(trained, 3);
  await trained.fire("turn.complete", { turnId: "t1", answer: "", durationMs: 1, isAborted: false, reason: "answer" });
  const party = await trained.fire("ui.render", band({ isWorking: false }), null);
  assert.match(trained.texts(party), /NUEVO RÉCORD/);
  assert.match(trained.texts(party), /\+3 reps/);
  assert.equal(trained.store.get("stats").record, 3);
  await trained.advance(4000);
  assert.deepEqual(await trained.fire("ui.render", band({ isWorking: false }), { theirs: true }), { theirs: true }, "después se va");

  const idle = await harness();
  await start(idle);
  await idle.fire("turn.complete", { turnId: "t1", answer: "", durationMs: 1, isAborted: false, reason: "answer" });
  assert.deepEqual(await idle.fire("ui.render", band({ isWorking: false }), { theirs: true }), { theirs: true });
});

test("/gains elige el modo, lo guarda y lo respeta", async () => {
  const h = await harness();
  await h.fire("session.start", { isInteractive: true });
  assert.match((await h.fire("command.run", { command: "gains", args: "modo" })).text, /modo discreto/);
  const r = await h.fire("command.run", { command: "gains", args: "apagado" });
  assert.match(r.text, /modo apagado/);
  assert.equal(h.store.get("mode"), "off");
  await h.fire("turn.start", { turnId: "t1" });
  await h.advance(9000);
  assert.deepEqual(await h.fire("ui.render", band(), { theirs: true }), { theirs: true }, "apagado: nada");
  await h.fire("command.run", { command: "gains", args: "siempre" });
  assert.ok(h.find(await h.fire("ui.render", band(), null), "Raster"), "siempre: el gimnasio desde el principio");
  assert.match((await h.fire("command.run", { command: "gains", args: "stats" })).text, /récord/);
});

test("los modos se aceptan en inglés y en español", async () => {
  const h = await harness({ settings: {} });
  await h.fire("session.start", { isInteractive: true });
  assert.match((await h.fire("command.run", { command: "gains", args: "always" })).text, /always mode/);
  assert.equal(h.store.get("mode"), "always");
  assert.match((await h.fire("command.run", { command: "gains", args: "discreto" })).text, /subtle mode/);
  assert.equal(h.store.get("mode"), "subtle");
});

test("de fábrica en inglés; en español si Claude Code está en español", async () => {
  const en = await harness({ settings: {} });
  await start(en);
  await en.advance(8100);
  assert.match(en.texts(await en.fire("ui.render", band(), null)), /Train Clawd/);
  const es = await harness({ settings: { language: "spanish" } });
  await start(es);
  await es.advance(8100);
  assert.match(es.texts(await es.fire("ui.render", band(), null)), /Entrená a Clawd/);
  const forced = await harness({ settings: { language: "español" }, config: { lang: "en" } });
  await start(forced);
  await forced.advance(8100);
  assert.match(forced.texts(await forced.fire("ui.render", band(), null)), /Train Clawd/, "lang en manda");
});

test("la invitación muestra el atajo que la persona tiene en keybindings.json", async () => {
  const files = { "/home/ale/.claude/keybindings.json": JSON.stringify({ bindings: [{ context: "Chat", bindings: { "alt+g": "abovePrompt:focus" } }] }) };
  const custom = await harness({ env: { HOME: "/home/ale" }, files });
  await start(custom);
  await custom.advance(8100);
  assert.match(custom.texts(await custom.fire("ui.render", band(), null)), /alt\+g, después/);
  const plain = await harness();
  await start(plain);
  await plain.advance(8100);
  assert.match(plain.texts(await plain.fire("ui.render", band(), null)), /ctrl\+x tab, después/);
});

test("recargado en caliente (sin session.start), igual detecta idioma y atajo", async () => {
  const files = { "C:\\Users\\ale/.claude/keybindings.json": JSON.stringify({ bindings: [{ context: "Chat", bindings: { "alt+g": "abovePrompt:focus" } }] }) };
  const h = await harness({ env: { USERPROFILE: "C:\\Users\\ale" }, files });
  await h.fire("turn.start", { turnId: "t1", text: "hola" });   // sin session.start: así queda tras una recarga
  await h.advance(8100);
  const text = h.texts(await h.fire("ui.render", band(), null));
  assert.match(text, /Entrená a Clawd/);
  assert.match(text, /alt\+g, después/);
});

test("si Claude termina mientras Clawd invita, se despide saludando y recién después se va", async () => {
  const h = await harness();
  await start(h);
  await h.advance(8100);
  assert.match(h.texts(await h.fire("ui.render", band(), null)), /Entrená a Clawd/);
  await h.fire("turn.complete", { turnId: "t1", answer: "", durationMs: 1, isAborted: false, reason: "answer" });
  const bye = await h.fire("ui.render", band({ isWorking: false }), null);
  assert.match(h.texts(bye), /Nos vemos/);
  assert.equal(tapButton(h, bye), null, "despidiéndose ya no ofrece la tecla");
  await h.advance(5200);                                    // la invitación dura al menos 5 s desde que apareció
  assert.deepEqual(await h.fire("ui.render", band({ isWorking: false }), { theirs: true }), { theirs: true }, "después se va");
});

test("una invitación recién aparecida queda al menos 5 s aunque Claude termine", async () => {
  const h = await harness();
  await start(h);
  await h.advance(8100);
  await h.fire("ui.render", band(), null);                  // aparece
  await h.advance(500);
  await h.fire("turn.complete", { turnId: "t1", answer: "", durationMs: 1, isAborted: false, reason: "answer" });
  await h.advance(3000);                                    // 3,5 s desde que apareció
  assert.match(h.texts(await h.fire("ui.render", band({ isWorking: false }), null)), /Nos vemos/);
  await h.advance(2000);                                    // 5,5 s
  assert.deepEqual(await h.fire("ui.render", band({ isWorking: false }), { theirs: true }), { theirs: true });
});

test("/gains abre un panel compacto con el teclado: Clawd del tamaño de siempre, sin agrandarse", async () => {
  const h = await harness();
  await h.fire("session.start", { isInteractive: true });
  assert.deepEqual(await h.fire("command.run", { command: "gains", args: "" }), {});
  const open = h.calls.find((c) => c[0] === "open")[1];
  assert.equal(open.focus, true);
  assert.equal(open.closeOnEscape, true);
  assert.equal(open.rows, SCENE_H / 2 + 1, "pide solo el alto del gimnasio");
  const pane = (bodyColumns, bodyRows) => ({ component: "Pane", requestId: "clawd-gains", surface: "terminal", props: { isFocused: true, bodyColumns, scroll: { offset: 0, bodyRows } } });
  for (const [cols, rows] of [[140, 30], [100, 22], [60, 14]]) {
    const r = h.find(await h.fire("ui.render", pane(cols, rows)), "Raster");
    assert.deepEqual([r.props.columns, r.props.rows], [SCENE_W, SCENE_H / 2], `${cols}x${rows}`);
  }
  const tree = await h.fire("ui.render", pane(140, 30));
  await tapButton(h, tree).props.onPress();
  assert.match(h.texts(await h.fire("ui.render", pane(140, 30))), /1\/10/, "x cuenta en el panel");
});

test("con el panel de /gains abierto la banda descansa; al cerrarlo con Esc, vuelve", async () => {
  const h = await harness({ config: SIEMPRE });
  await start(h);
  await h.fire("command.run", { command: "gains", args: "" });
  assert.deepEqual(await h.fire("ui.render", band(), { theirs: true }), { theirs: true });
  await h.fire("ui.close", { id: "clawd-gains", origin: { kind: "person" } });
  assert.ok(h.find(await h.fire("ui.render", band(), null), "Raster"));
});

test("el modo guardado vale en la sesión siguiente", async () => {
  const h = await harness({ stored: { mode: "siempre" } });
  await start(h);
  assert.ok(h.find(await h.fire("ui.render", band(), null), "Raster"));
});

// Gimnasio (modo siempre)

test("el gimnasio: escena de 41x8 a la izquierda y contadores a la derecha, sin abrir paneles", async () => {
  const h = await harness({ config: SIEMPRE });
  await start(h);
  assert.ok(!h.calls.some((c) => c[0] === "open"), "abajo no abre paneles");
  const tree = await h.fire("ui.render", band(), null);
  const raster = h.find(tree, "Raster");
  assert.equal(raster.props.columns, SCENE_W);
  assert.equal(raster.props.rows, SCENE_H / 2);
  assert.equal(typeof raster.props.cells, "string");
  assert.equal(tree.props.flexDirection, "row");
  const button = tapButton(h, tree);
  assert.equal(button.props.plain, true);
  assert.equal(button.props.autoFocus, undefined, "sin foco automático: el botón no se dibuja invertido");
  assert.match(h.texts(tree), /CURL DE BÍCEPS/);
});

test("el gimnasio no pinta fondos ni invierte colores", async () => {
  const h = await harness({ config: SIEMPRE });
  await start(h);
  const tree = await h.fire("ui.render", band(), null);
  for (const node of h.all(tree)) {
    assert.equal(node.props.backgroundColor, undefined, `${node.type} con fondo`);
    assert.equal(node.props.inverse, undefined, `${node.type} invertido`);
  }
});

test("el bucle anima la escena con blit a ~30 cuadros por segundo, sin redibujar todo", async () => {
  const h = await harness({ config: SIEMPRE });
  await start(h);
  await h.fire("ui.render", band(), null);
  assert.ok(h.timers.find((t) => t.ms === 33), "bucle de 33 ms");
  await press(h, 3);
  h.calls.length = 0;
  await h.advance(400);
  const blits = h.calls.filter((c) => c[0] === "blit").map((c) => c[1]);
  assert.ok(blits.length >= 5, `solo ${blits.length} blits`);
  assert.ok(blits.every((b) => b.requestId === "band" && b.key === "clawd" && typeof b.cells === "string"));
  assert.ok(new Set(blits.map((b) => b.cells)).size >= 3, "los cuadros cambian");
});

test("cada toque es una repetición: el spinner y los contadores la muestran", async () => {
  const h = await harness({ config: SIEMPRE });
  await start(h);
  await press(h);
  const spinner = await h.fire("ui.render", { component: "Spinner", props: { word: "Thinking" } }, (e) => e);
  assert.equal(spinner.props.suffix, " · 💪 1 rep…");
  const text = h.texts(await h.fire("ui.render", band(), null));
  assert.match(text, /1\/10/);
  assert.match(text, /━/);
  assert.doesNotMatch(text, /[●○]/, "sin puntitos de toques cuando cada toque es una repetición");
});

test("mantener la x apretada no suma: cuenta como mucho dos y avisa", async () => {
  const h = await harness({ config: SIEMPRE });
  await start(h);
  const button = () => h.fire("ui.render", band(), null).then((t) => tapButton(h, t));
  await (await button()).props.onPress();                  // la pulsación de verdad
  await h.advance(500);                                     // la demora antes de que la terminal repita
  for (let i = 0; i < 30; i++) { await (await button()).props.onPress(); await h.advance(33); }  // repite cada 33 ms
  const text = h.texts(await h.fire("ui.render", band(), null));
  assert.ok(m_reps(text) <= 2, text);
  assert.match(text, /tocá, no mantengas/);
  await h.advance(1600);
  assert.doesNotMatch(h.texts(await h.fire("ui.render", band(), null)), /no mantengas/, "el aviso se va solo");
});
const m_reps = (text) => Number(/(\d+) reps? ·/.exec(text)?.[1] ?? 0);

test("con tapsPerRep 3 vuelven los puntitos de la repetición en curso", async () => {
  const h = await harness({ config: { ...SIEMPRE, tapsPerRep: 3 } });
  await start(h);
  await press(h, 2);
  assert.match(h.texts(await h.fire("ui.render", band(), null)), /●●○/);
});

test("permiso pendiente: la tecla desaparece y no cuenta hasta que termina la herramienta", async () => {
  const h = await harness({ config: SIEMPRE, check: { decision: "ask" } });
  await start(h);
  const oldButton = tapButton(h, await h.fire("ui.render", band(), null));
  let during;
  await h.fire("tool.call", { tool: "Bash", command: "rm -rf build", tool_use_id: "tu1" }, async () => {
    during = await h.fire("ui.render", band(), null);
    await oldButton.props.onPress(); await oldButton.props.onPress(); await oldButton.props.onPress();
    return { result: "ok" };
  });
  assert.deepEqual(h.calls.find((c) => c[0] === "tool.check")[1], { tool: "Bash", input: { command: "rm -rf build" } }, "consulta la decisión con los argumentos de la herramienta");
  assert.equal(tapButton(h, during), null, "sin botón mientras está el diálogo");
  assert.match(h.texts(during), /respondé a Claude/);
  assert.ok(tapButton(h, await h.fire("ui.render", band(), null)), "el botón vuelve");
  const spinner = await h.fire("ui.render", { component: "Spinner", props: {} }, (e) => e);
  assert.equal(spinner.props.suffix, undefined, "los toques durante el diálogo no contaron");
});

test("herramienta permitida: la tecla sigue durante la llamada", async () => {
  const h = await harness({ config: SIEMPRE });
  await start(h);
  let during;
  await h.fire("tool.call", { tool: "Read", file_path: "a.md" }, async () => { during = await h.fire("ui.render", band(), null); return { result: "ok" }; });
  assert.ok(tapButton(h, during));
});

test("AskUserQuestion también saca la tecla hasta que se responde", async () => {
  const h = await harness({ config: SIEMPRE });
  await start(h);
  let during;
  await h.fire("tool.call", { tool: "AskUserQuestion", questions: [] }, async () => { during = await h.fire("ui.render", band(), null); return { result: "respondida" }; });
  assert.equal(tapButton(h, during), null);
  assert.ok(tapButton(h, await h.fire("ui.render", band(), null)));
});

test("en Ghostty la escena es una imagen PNG transparente, y el bucle cambia su fuente", async () => {
  const h = await harness({ config: SIEMPRE, env: { TERM_PROGRAM: "ghostty" } });
  await start(h);
  const tree = await h.fire("ui.render", band(), null);
  const img = h.find(tree, "Image");
  assert.ok(img, "Image");
  assert.equal(h.find(tree, "Raster"), null);
  assert.equal(img.props.columns, SCENE_W);
  assert.equal(img.props.rows, SCENE_H / 2);
  assert.ok(img.props.alt.length > 0);
  assert.equal(Buffer.from(img.props.source.png, "base64").toString("latin1", 1, 4), "PNG");
  await press(h);
  await h.advance(200);
  assert.equal(typeof h.calls.find((c) => c[0] === "blit")[1].source.png, "string");
});

test("kitty también; dentro de tmux no (Claude Code no dibuja imágenes ahí)", async () => {
  const kitty = await harness({ config: SIEMPRE, env: { KITTY_WINDOW_ID: "1" } });
  await start(kitty);
  assert.ok(kitty.find(await kitty.fire("ui.render", band(), null), "Image"));
  const tmux = await harness({ config: SIEMPRE, env: { TERM_PROGRAM: "ghostty", TMUX: "/tmp/tmux-1/default,1,0" } });
  await start(tmux);
  assert.ok(tmux.find(await tmux.fire("ui.render", band(), null), "Raster"));
});

test("si la imagen no se monta, cae a medios bloques solo", async () => {
  const h = await harness({ config: SIEMPRE, env: { TERM_PROGRAM: "ghostty" }, blit: (a) => (a.source ? { deny: "no Image here" } : {}) });
  await start(h);
  assert.ok(h.find(await h.fire("ui.render", band(), null), "Image"));
  await press(h);
  await h.advance(600);
  assert.ok(h.find(await h.fire("ui.render", band(), null), "Raster"), "volvió a Raster");
});

test("banda baja: una sola línea con la tecla; con una encuesta, cede la banda", async () => {
  const h = await harness({ config: SIEMPRE });
  await start(h);
  const low = await h.fire("ui.render", band({ maxRows: 4 }), null);
  assert.equal(h.find(low, "Raster"), null);
  assert.ok(tapButton(h, low));
  assert.deepEqual(await h.fire("ui.render", band({ hasSurvey: true }), { survey: true }), { survey: true });
});

test("en `claude -p` no dibuja nada", async () => {
  const h = await harness({ config: SIEMPRE });
  await h.fire("session.start", { isInteractive: false, surface: null });
  await h.fire("turn.start", { turnId: "t1" });
  assert.deepEqual(await h.fire("ui.render", band(), { theirs: true }), { theirs: true });
  assert.ok(!h.calls.some((c) => c[0] === "open"));
});

test("en Desktop (sin Raster) muestra el Clawd chico de texto", async () => {
  const h = await harness({ config: SIEMPRE });
  await start(h);
  const tree = await h.fire("ui.render", band({}, { surface: "desktop" }), null);
  assert.equal(h.find(tree, "Raster"), null);
  assert.equal(h.find(tree, "Text").props.color, "clawd_body");
});

test("con movimiento reducido no hay bucle de animación, pero la tecla funciona", async () => {
  const h = await harness({ config: SIEMPRE, settings: { prefersReducedMotion: true } });
  await start(h);
  await h.fire("ui.render", band(), null);
  assert.ok(!h.timers.some((t) => t.ms === 33));
  await press(h);
  assert.match(h.texts(await h.fire("ui.render", band(), null)), /1\/10/);
});

// Modo panel

test("modo panel: abre con foco al empezar el turno, se cierra ante un permiso y vuelve después", async () => {
  const h = await harness({ config: { place: "panel" }, check: { decision: "ask" } });
  await start(h);
  const open = h.calls.find((c) => c[0] === "open");
  assert.equal(open[1].focus, true);
  assert.equal(open[1].closeOnEscape, true);
  const tree = await h.fire("ui.render", { component: "Pane", requestId: "clawd-gains", surface: "terminal", props: { isFocused: true } });
  assert.ok(h.find(tree, "Raster"));
  assert.deepEqual(await h.fire("ui.render", band(), { theirs: true }), { theirs: true }, "en modo panel no usa la banda");
  h.calls.length = 0;
  await h.fire("tool.call", { tool: "Bash", command: "ls" }, async () => { assert.ok(h.calls.some((c) => c[0] === "close")); return { result: "ok" }; });
  assert.ok(h.calls.filter((c) => c[0] === "open").length >= 1, "reabrió el panel");
});

test("modo panel: Esc de la persona lo deja cerrado ante el siguiente permiso", async () => {
  const h = await harness({ config: { place: "panel" }, check: { decision: "ask" } });
  await start(h);
  await h.fire("ui.close", { id: "clawd-gains", origin: { kind: "person" } });
  h.calls.length = 0;
  await h.fire("tool.call", { tool: "Bash", command: "ls" }, async () => ({ result: "ok" }));
  assert.ok(!h.calls.some((c) => c[0] === "close" || c[0] === "open"));
});

test("un panel de otro mod se deja pasar", async () => {
  const h = await harness();
  const r = await h.fire("ui.render", { component: "Pane", requestId: "otro", surface: "terminal", props: {} }, { theirs: true });
  assert.deepEqual(r, { theirs: true });
});
