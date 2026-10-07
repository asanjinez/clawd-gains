// Al guardar, el mod se recarga solo.
export const CONFIG = {
  key: "x",              // una letra minúscula o un dígito
  tapsPerRep: 1,         // toques por repetición
  repsPerSet: 10,        // repeticiones antes de cambiar de ejercicio
  exercises: ["curl", "sentadillas", "press", "crabwalk"], // también hay "dominadas" y "soga"
  tiredAfterMs: 4000,    // sin toques -> cansado
  idleAfterMs: 10000,    // sin toques -> reposo
  celebrateMs: 3000,     // festejo al terminar el turno
  mode: "discreto",      // "discreto", "siempre" o "apagado"; /gains lo cambia
  inviteAfterMs: 2000,   // modo discreto: cuánto espera Clawd para aparecer
  lang: "auto",          // "auto", "en" o "es"
  place: "abajo",        // "abajo" (sobre el prompt) o "panel"
  hd: "auto",            // "auto" (PNG en kitty y Ghostty), true o false
  autoOpen: true,        // con place: "panel", abrirlo en cada turno
};
