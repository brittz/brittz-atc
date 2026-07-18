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

  // decolagem recente: saída ainda baixa, usando a pista de decolagem
  function departing(ac) {
    return !!(ac && ac.kind === 'dep' && ac.airborne && ac.rwy && ac.alt < 3500 && ac.alt > 400);
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

    // Decolagens simultâneas
    if (g.simultaneousTakeoffs && departing(a) && departing(b) && rA !== rB)
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
  };
})();

if (typeof globalThis !== 'undefined') globalThis.Separation = Separation;
if (typeof module !== 'undefined') module.exports = { Separation };
