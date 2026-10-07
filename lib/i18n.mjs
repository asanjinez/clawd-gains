export const STRINGS = {
  en: {
    command: "Clawd Gains: open the gym · /gains subtle|always|off · /gains stats",
    modeName: { subtle: "subtle", always: "always", off: "off" },
    modeWhat: {
      subtle: "Clawd invites you to train when Claude takes a while, and grows when you press x",
      always: "Clawd trains below the prompt for the whole turn",
      off: "Clawd rests; only the counter next to the spinner stays",
    },
    modeLine: (name, what) => `Clawd Gains · ${name} mode: ${what}.`,
    modeHelp: "Change it with /gains subtle, /gains always or /gains off; /gains opens the gym; /gains stats shows your numbers.",
    stats: (s, rep) => `Clawd Gains · session ${rep(s.repsSession)} · record ${s.stats.record} · total ${rep(s.stats.totalReps)} in ${s.stats.sessions} ${s.stats.sessions === 1 ? "session" : "sessions"}`,
    reset: (n) => `Clawd Gains: record reset (now ${n}).`,
    narrow: "Clawd Gains: the terminal is too narrow to open the panel by itself. Open it with /gains.",
    invite: "Train Clawd",
    hold: "✋ tap, don't hold",
    bye: "See you!",
    train: "train",
    start: (k) => `${k}, then `,
    recordLine: (r) => `record: ${r} reps`,
    exercises: { curl: "Bicep curls", sentadillas: "Squats", press: "Overhead press", crabwalk: "Crab walk", dominadas: "Pull-ups", soga: "Jump rope" },
    tired: (k) => `💦 keep going: ${k}!`,
    record: "🏆 NEW RECORD!",
    nice: "🎉 NICE WORK!",
    thisTurn: (r) => `+${r}`,
    lastTurn: (r) => `last turn: ${r}`,
    pace: "pace",
    onFire: "on fire!",
    counters: (reps) => `${reps} · record `,
    wait: "⏸ answer Claude first",
    escBand: "esc: exit",
    escPane: "esc: close",
    paneIdle: "click to play",
    alt: "Clawd training",
  },
  es: {
    command: "Clawd Gains: abrir el gimnasio · /gains discreto|siempre|apagado · /gains stats",
    modeName: { subtle: "discreto", always: "siempre", off: "apagado" },
    modeWhat: {
      subtle: "Clawd invita a entrenar cuando Claude tarda y se agranda cuando apretás x",
      always: "Clawd entrena abajo durante todo el turno",
      off: "Clawd descansa; solo queda el contador junto al spinner",
    },
    modeLine: (name, what) => `Clawd Gains · modo ${name}: ${what}.`,
    modeHelp: "Cambialo con /gains discreto, /gains siempre o /gains apagado; /gains abre el gimnasio; /gains stats muestra tus números.",
    stats: (s, rep) => `Clawd Gains · sesión ${rep(s.repsSession)} · récord ${s.stats.record} · total ${rep(s.stats.totalReps)} en ${s.stats.sessions} ${s.stats.sessions === 1 ? "sesión" : "sesiones"}`,
    reset: (n) => `Clawd Gains: récord reiniciado (ahora ${n}).`,
    narrow: "Clawd Gains: la terminal es angosta para abrir el panel solo. Abrilo con /gains.",
    invite: "Entrená a Clawd",
    hold: "✋ tocá, no mantengas",
    bye: "¡Nos vemos!",
    train: "entrenar",
    start: (k) => `${k}, después `,
    recordLine: (r) => `récord: ${r} reps`,
    exercises: { curl: "Curl de bíceps", sentadillas: "Sentadillas", press: "Press con barra", crabwalk: "Crab walk", dominadas: "Dominadas", soga: "Saltar la soga" },
    tired: (k) => `💦 ¡seguí con ${k}!`,
    record: "🏆 ¡NUEVO RÉCORD!",
    nice: "🎉 ¡BIEN AHÍ!",
    thisTurn: (r) => `+${r}`,
    lastTurn: (r) => `último turno: ${r}`,
    pace: "ritmo",
    onFire: "¡a full!",
    counters: (reps) => `${reps} · récord `,
    wait: "⏸ primero respondé a Claude",
    escBand: "esc: salir",
    escPane: "esc: cerrar",
    paneIdle: "clic para jugar",
    alt: "Clawd entrenando",
  },
};

// Atajo de fábrica de abovePrompt:focus.
export const DEFAULT_FOCUS_KEYS = "ctrl+x tab";

// Primero config.lang, después el idioma de Claude Code y por último LANG.
export function pickLang({ lang, language, envLang } = {}) {
  if (lang === "en" || lang === "es") return lang;
  if (language) return /^(es|spa|españ|castell)/i.test(String(language)) ? "es" : "en";
  return /^es/i.test(envLang ?? "") ? "es" : "en";
}

export const plural = (n) => `${n} ${n === 1 ? "rep" : "reps"}`;
