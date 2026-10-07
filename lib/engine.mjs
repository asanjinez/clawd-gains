// Cuenta toques, repeticiones y sets, y lleva el estado de Clawd.
// No usa timers: cada llamada recibe `now` en ms.

// Los mismos campos que config.mjs.
export const DEFAULTS = {
  key: "x",
  tapsPerRep: 1,
  repsPerSet: 10,
  exercises: ["curl", "sentadillas", "press", "crabwalk"],
  tiredAfterMs: 4000,
  idleAfterMs: 10000,
  celebrateMs: 3000,
  mode: "discreto",
  inviteAfterMs: 2000,
  lang: "auto",
  place: "abajo",
  hd: "auto",
};

export const EXERCISE_IDS = ["curl", "sentadillas", "press", "crabwalk", "dominadas", "soga"];

// Medidor de ritmo: toques por cubeta.
export const TEMPO_BUCKETS = 5;
export const TEMPO_BUCKET_MS = 400;

export function createEngine(config = {}, savedStats = {}) {
  const cfg = { ...DEFAULTS, ...config };
  // una config vieja puede nombrar ejercicios que ya no existen
  cfg.exercises = (cfg.exercises ?? []).filter((id) => EXERCISE_IDS.includes(id));
  if (!cfg.exercises.length) cfg.exercises = DEFAULTS.exercises;

  const s = {
    mode: "reposo",
    modeChangedAt: 0,
    exerciseIndex: 0,
    tapsInExercise: 0,
    tapsTowardRep: 0,
    repsInSet: 0,
    repsTurn: 0,
    repsSession: 0,
    lastTapAt: null,
    tapTimes: [],
    turnActive: false,
    lastSummary: null,
    stats: { record: 0, totalReps: 0, sessions: 0, ...savedStats },
  };
  const tempoWindow = TEMPO_BUCKETS * TEMPO_BUCKET_MS;
  const pruneTaps = (now) => { s.tapTimes = s.tapTimes.filter((t) => now - t < tempoWindow); };
  const recordAtStart = s.stats.record;

  function setMode(mode, now) {
    if (s.mode === mode) return false;
    s.mode = mode;
    s.modeChangedAt = now;
    return true;
  }

  return {
    config: cfg,
    state: s,

    exercise() {
      return cfg.exercises[s.exerciseIndex];
    },

    tap(now) {
      setMode("entrenando", now);
      s.lastTapAt = now;
      s.tapTimes.push(now);
      pruneTaps(now);
      s.tapsInExercise++;
      s.tapsTowardRep++;
      const out = { rep: false, rotated: false, record: false };
      if (s.tapsTowardRep >= cfg.tapsPerRep) {
        s.tapsTowardRep = 0;
        out.rep = true;
        s.repsInSet++;
        s.repsTurn++;
        s.repsSession++;
        s.stats.totalReps++;
        if (s.repsSession > s.stats.record) {
          s.stats.record = s.repsSession;
          out.record = true;
        }
        if (s.repsInSet >= cfg.repsPerSet) {
          s.repsInSet = 0;
          s.exerciseIndex = (s.exerciseIndex + 1) % cfg.exercises.length;
          s.tapsInExercise = 0;
          out.rotated = true;
        }
      }
      return out;
    },

    // Devuelve true si cambió el modo.
    tick(now) {
      if (s.mode === "entrenando" && now - s.lastTapAt >= cfg.tiredAfterMs) return setMode("cansado", now);
      if (s.mode === "cansado" && now - s.lastTapAt >= cfg.idleAfterMs) return setMode("reposo", now);
      if (s.mode === "festejo" && now - s.modeChangedAt >= cfg.celebrateMs) return setMode("reposo", now);
      return false;
    },

    startTurn(now) {
      s.turnActive = true;
      s.repsTurn = 0;
      s.lastSummary = null;
      if (s.mode === "festejo") setMode("reposo", now);
    },

    endTurn(now) {
      s.turnActive = false;
      const summary = {
        repsTurn: s.repsTurn,
        repsSession: s.repsSession,
        record: s.stats.record,
        isRecord: s.repsSession > recordAtStart && s.repsTurn > 0,
      };
      s.lastSummary = summary;
      setMode(s.repsTurn > 0 ? "festejo" : "reposo", now);
      return summary;
    },

    resetRecord() {
      s.stats.record = s.repsSession;
    },

    // De la cubeta más vieja a la actual.
    tempo(now) {
      pruneTaps(now);
      const buckets = Array(TEMPO_BUCKETS).fill(0);
      for (const t of s.tapTimes) {
        const age = now - t;
        if (age >= 0 && age < tempoWindow) buckets[TEMPO_BUCKETS - 1 - Math.floor(age / TEMPO_BUCKET_MS)]++;
      }
      return buckets;
    },

    // Lo que usa motion.mjs. tempo va en toques por segundo.
    snapshot(now) {
      const tempo = this.tempo(now).reduce((a, b) => a + b, 0) / (tempoWindow / 1000);
      return { mode: s.mode, exercise: this.exercise(), taps: s.tapsInExercise, reps: s.repsSession, tempo };
    },
  };
}
