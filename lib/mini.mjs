// El Clawd chico de Claude Code (3x9) con las poses de su animación de bienvenida.
// Los ojos van sobre clawd_background y los párpados (▂), invertidos.

export const ARMS = {
  down: { r1L: " ▐", r1R: "", r2L: "▝▜", r2R: "█▀" },
  up: { r1L: "▗▟", r1R: "▄", r2L: " ▜", r2R: "█▘" },
};

// [texto, esPárpado]
export const EYES = {
  open: [["▛███▛█"]],
  right: [["█▟███▟"]],
  left: [["▟███▟█"]],
  closed: [["▂", true], ["███"], ["▂", true], ["█"]],
  wink: [["▛███"], ["▂", true], ["█"]],
};

export const FEET = " ▝▝   ▝▝ ";

// [ojos, brazos, ms]
export const MINI_SEQ = [
  ["open", "down", 1600], ["right", "down", 700], ["left", "down", 700], ["open", "down", 400],
  ["open", "up", 180], ["open", "down", 180], ["open", "up", 180], ["open", "down", 900],
  ["closed", "down", 130], ["open", "down", 900], ["wink", "down", 450], ["open", "down", 600],
];

export const MINI_BYE = [
  ["open", "up", 220], ["open", "down", 220], ["open", "up", 220], ["open", "down", 220], ["wink", "up", 500], ["open", "down", 300],
];

export const seqTotal = (seq) => seq.reduce((a, [, , ms]) => a + ms, 0);

// Sin loop, se queda en la última pose.
export function poseAt(seq, t, loop = true) {
  const total = seqTotal(seq);
  let k = loop ? ((t % total) + total) % total : Math.min(Math.max(t, 0), total - 1);
  for (let i = 0; i < seq.length; i++) { k -= seq[i][2]; if (k < 0) return i; }
  return seq.length - 1;
}

// Tramos { text, eye?, lid? } por fila.
export function miniRows(eyes, arms) {
  const a = ARMS[arms];
  const eyeParts = EYES[eyes].map(([text, lid]) => (lid ? { text, lid: true } : { text, eye: true }));
  const width1 = a.r1L.length + EYES[eyes].reduce((n, [s]) => n + s.length, 0) + a.r1R.length;
  return [
    [{ text: a.r1L }, ...eyeParts, { text: a.r1R + " ".repeat(Math.max(0, 9 - width1)) }],
    [{ text: a.r2L }, { text: "█████" }, { text: a.r2R }],
    [{ text: FEET }],
  ];
}
