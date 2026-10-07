// Claude Code no avisa si una tecla está sostenida: la terminal la repite y
// cada repetición llega como un toque más. Se reconocen por el ritmo, porque
// son más rápidas o más regulares que una persona. Ante la duda, cuenta.

export const HOLD = {
  minGapMs: 45,        // nadie aprieta tan rápido; Windows y Linux repiten cada 30-40 ms
  steadyCount: 6,      // tantos intervalos seguidos...
  steadyJitterMs: 5,   // ...que difieren entre sí menos que esto...
  steadyMaxMs: 130,    // ...y son así de cortos: tecla sostenida (macOS repite cada ~90 ms)
};

export function createHoldFilter(o = HOLD) {
  let last = null;
  const gaps = [];
  return {
    // false si es la repetición de una tecla sostenida
    accept(now) {
      if (last === null) { last = now; return true; }
      const gap = now - last;
      last = now;
      gaps.push(gap);
      if (gaps.length > o.steadyCount) gaps.shift();
      if (gap < o.minGapMs) return false;
      const steady = gaps.length === o.steadyCount
        && Math.max(...gaps) <= o.steadyMaxMs
        && Math.max(...gaps) - Math.min(...gaps) <= o.steadyJitterMs;
      return !steady;
    },
  };
}
