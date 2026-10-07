import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine, DEFAULTS, TEMPO_BUCKETS } from "../lib/engine.mjs";

const tapN = (engine, n, t0 = 0) => { for (let i = 0; i < n; i++) engine.tap(t0 + i * 100); };

test("cada toque es una repetición", () => {
  const e = createEngine();
  const r = e.tap(0);
  assert.equal(r.rep, true);
  assert.equal(e.state.repsInSet, 1);
  assert.equal(e.state.repsSession, 1);
  assert.equal(e.state.repsTurn, 1);
  assert.equal(e.state.tapsTowardRep, 0);
  e.tap(100);
  assert.equal(e.state.repsSession, 2);
});

test("tapsPerRep es configurable: con 3, cada toque es un tercio de repetición", () => {
  const e = createEngine({ tapsPerRep: 3 });
  e.tap(0); e.tap(100);
  assert.equal(e.state.repsSession, 0);
  assert.equal(e.state.tapsTowardRep, 2);
  assert.equal(e.tap(200).rep, true);
  assert.equal(e.state.repsSession, 1);
  assert.equal(e.state.tapsTowardRep, 0);
});

test("los ejercicios rotan cada 10 repeticiones en el orden configurado", () => {
  const e = createEngine();
  assert.equal(e.exercise(), "curl");
  tapN(e, 9);
  assert.equal(e.exercise(), "curl");
  assert.equal(e.state.repsInSet, 9);
  const r = e.tap(900);
  assert.equal(r.rotated, true);
  assert.equal(e.exercise(), "sentadillas");
  assert.equal(e.state.repsInSet, 0);
  assert.equal(e.state.tapsInExercise, 0);
  tapN(e, 10, 1000); assert.equal(e.exercise(), "press");
  tapN(e, 10, 2000); assert.equal(e.exercise(), "crabwalk");
  tapN(e, 10, 3000); assert.equal(e.exercise(), "curl", "vuelve al primero");
  assert.equal(e.state.repsSession, 40);
});

test("repsPerSet y lista de ejercicios configurables", () => {
  const e = createEngine({ repsPerSet: 2, exercises: ["soga", "dominadas"] });
  tapN(e, 2);
  assert.equal(e.exercise(), "dominadas");
  tapN(e, 2, 1000);
  assert.equal(e.exercise(), "soga");
});

test("una config con ejercicios que no existen se queda con los que sí", () => {
  assert.deepEqual(createEngine({ exercises: ["flexiones", "curl", "reposo"] }).config.exercises, ["curl"]);
  assert.deepEqual(createEngine({ exercises: ["flexiones"] }).config.exercises, DEFAULTS.exercises);
});

test("sin toques pasa a cansado y después a reposo; un toque lo despierta", () => {
  const e = createEngine();
  e.tap(0);
  assert.equal(e.state.mode, "entrenando");
  assert.equal(e.tick(DEFAULTS.tiredAfterMs - 1), false);
  assert.equal(e.tick(DEFAULTS.tiredAfterMs), true);
  assert.equal(e.state.mode, "cansado");
  assert.equal(e.tick(DEFAULTS.idleAfterMs - 1), false);
  assert.equal(e.tick(DEFAULTS.idleAfterMs), true);
  assert.equal(e.state.mode, "reposo");
  e.tap(DEFAULTS.idleAfterMs + 1);
  assert.equal(e.state.mode, "entrenando");
});

test("fin de turno con reps: festejo con resumen, después reposo", () => {
  const e = createEngine();
  e.startTurn(0);
  tapN(e, 2);
  const summary = e.endTurn(1000);
  assert.deepEqual(summary, { repsTurn: 2, repsSession: 2, record: 2, isRecord: true });
  assert.equal(e.state.mode, "festejo");
  assert.equal(e.tick(1000 + DEFAULTS.celebrateMs - 1), false);
  assert.equal(e.tick(1000 + DEFAULTS.celebrateMs), true);
  assert.equal(e.state.mode, "reposo");
});

test("fin de turno sin reps: no festeja", () => {
  const e = createEngine();
  e.startTurn(0);
  const summary = e.endTurn(10);
  assert.equal(summary.repsTurn, 0);
  assert.equal(summary.isRecord, false);
  assert.equal(e.state.mode, "reposo");
});

test("el récord guardado se respeta y se supera", () => {
  const e = createEngine({}, { record: 3, totalReps: 50, sessions: 2 });
  e.startTurn(0);
  tapN(e, 3);
  assert.equal(e.state.stats.record, 3);
  assert.equal(e.endTurn(1000).isRecord, false);
  e.startTurn(2000);
  const r = e.tap(2000);
  assert.equal(r.record, true);
  assert.equal(e.state.stats.record, 4);
  assert.equal(e.state.stats.totalReps, 54);
  assert.equal(e.endTurn(3000).isRecord, true);
});

test("el ritmo cuenta los toques recientes por cubeta y decae solo", () => {
  const e = createEngine();
  assert.deepEqual(e.tempo(0), Array(TEMPO_BUCKETS).fill(0));
  e.tap(0); e.tap(100); e.tap(500);
  assert.deepEqual(e.tempo(600), [0, 0, 0, 2, 1]);
  assert.deepEqual(e.tempo(3000), [0, 0, 0, 0, 0]);
  assert.equal(e.state.tapTimes.length, 0, "los toques viejos se descartan");
});

test("snapshot le da al motor de movimiento modo, ejercicio, toques, reps y toques por segundo", () => {
  const e = createEngine();
  tapN(e, 4);
  assert.deepEqual(e.snapshot(400), { mode: "entrenando", exercise: "curl", taps: 4, reps: 4, tempo: 2 });
});
