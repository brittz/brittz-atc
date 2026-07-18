// ============================================================
// Regras de separação — contexto operacional + dados do aeroporto
// DATA.SEPARATION vem do JSON (não hardcode de aeroporto na engine).
// ============================================================
'use strict';

const Separation = (() => {
  const DEFAULTS = {
    radarNm: 3,
    radarFt: 1000,
    predictNm: 3.2,
    parallelOps: [],
  };

  function normalize(raw) {
    const s = Object.assign({}, DEFAULTS, raw || {});
    s.parallelOps = Array.isArray(s.parallelOps) ? s.parallelOps : [];
    return s;
  }

  function cfg() {
    return (typeof DATA !== 'undefined' && DATA.SEPARATION)
      ? DATA.SEPARATION
      : DEFAULTS;
  }

  function rwyOf(ac) {
    if (!ac) return null;
    if (ac.app && ac.app.phase && ac.app.phase !== 'none' && ac.app.rwy) return ac.app.rwy;
    return ac.rwy || null;
  }

  function stripOf(rwy) {
    if (!rwy || typeof DATA === 'undefined') return null;
    return DATA.RWY_PAIR[rwy] || null;
  }

  function onApproach(ac) {
    return !!(ac && ac.airborne && ac.app && ac.app.phase && ac.app.phase !== 'none');
  }

  function establishedIls(ac) {
    return !!(ac && ac.app && (ac.app.phase === 'loc' || ac.app.phase === 'gs'));
  }

  // Distância ao aeródromo (NM) para considerar decolagem ainda "inicial"
  const DEPARTURE_BUBBLE_NM = 15;

  function distField(ac) {
    if (!ac) return Infinity;
    if (typeof U !== 'undefined' && U.dist) return U.dist(0, 0, ac.x, ac.y);
    return Math.hypot(ac.x || 0, ac.y || 0);
  }

  /**
   * Decolagem inicial: saída airborne ainda na bolha do aeródromo.
   * Não usar só teto de altitude — pistas paralelas (ex.: SBCV N/S ~0.8 NM)
   * permanecem próximas na proa de pista após 3500 ft; um teto baixo gerava
   * STCA/alarme falso em decolagens simultâneas autorizadas.
   */
  function departing(ac) {
    return !!(ac && ac.kind === 'dep' && ac.airborne && ac.rwy
      && ac.alt > 400 && distField(ac) < DEPARTURE_BUBBLE_NM);
  }

  function arriving(ac) {
    return !!(ac && ac.kind === 'arr' && onApproach(ac));
  }

  function findParallelGroup(stripA, stripB) {
    if (!stripA || !stripB || stripA === stripB) return null;
    for (const g of cfg().parallelOps) {
      const strips = g.strips || [];
      if (strips.includes(stripA) && strips.includes(stripB)) return g;
    }
    return null;
  }

  /**
   * true = par isento (operação válida) — não gerar STCA/alarme/pontos.
   */
  function isExempt(a, b) {
    const rA = rwyOf(a), rB = rwyOf(b);
    const sA = stripOf(rA), sB = stripOf(rB);
    const g = findParallelGroup(sA, sB);
    if (!g) return false;

    // Aproximações independentes em strips paralelos
    if (g.independentApproaches && onApproach(a) && onApproach(b) && rA !== rB)
      return true;

    // Decolagens simultâneas: ambos deps em faixas distintas, ainda na bolha
    // (usa max distância para não perder a isenção quando um sai ~1 s antes)
    if (g.simultaneousTakeoffs && a.kind === 'dep' && b.kind === 'dep' && rA !== rB
      && a.airborne && b.airborne && a.alt > 400 && b.alt > 400
      && Math.max(distField(a), distField(b)) < DEPARTURE_BUBBLE_NM)
      return true;

    // Pouso (aproximação) numa + decolagem na paralela
    if (g.mixedArrivalDeparture) {
      if (arriving(a) && departing(b) && rA !== rB) return true;
      if (arriving(b) && departing(a) && rA !== rB) return true;
    }

    // Compat: ILS estabelecido em pistas distintas do grupo (mesmo sem flag explícita
    // de independentApproaches em aeroportos antigos — se o grupo existir e ambos
    // estabelecidos, tratar como independente quando a flag for true; já coberto acima)

    return false;
  }

  function thresholds() {
    const s = cfg();
    return { nm: s.radarNm, ft: s.radarFt, predictNm: s.predictNm };
  }

  return {
    DEFAULTS,
    DEPARTURE_BUBBLE_NM,
    normalize,
    cfg,
    thresholds,
    isExempt,
    findParallelGroup,
    rwyOf,
    stripOf,
    onApproach,
    establishedIls,
    departing,
    arriving,
    distField,
  };
})();

if (typeof globalThis !== 'undefined') globalThis.Separation = Separation;
if (typeof module !== 'undefined') module.exports = { Separation };
