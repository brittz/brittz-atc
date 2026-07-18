// ============================================================
// Aproximação e reatribuição de pista — Procedure / Nav / Approach
// Isolado do parser e da UI; Aircraft só delega.
// ============================================================
'use strict';

if (typeof DATA === 'undefined' && typeof require !== 'undefined') {
  const _d = require('./data.js');
  globalThis.DATA = _d.DATA;
  globalThis.U = _d.U;
}

const Approach = (() => {
  const TYPES = { ILS: 'ils', VISUAL: 'visual', RNAV: 'rnav', VOR: 'vor' };
  // distância típica para "aeroporto à vista" (NM do ARP / origem)
  const SIGHT_NM = 22;

  function ops(msg, extra) {
    return Object.assign({ err: String(msg), errKind: 'ops' }, extra || {});
  }
  function input(msg) {
    return { err: String(msg), errKind: 'input' };
  }

  // ---------- Procedure Manager ----------
  function emptyApp() {
    return { phase: 'none', rwy: null, type: null };
  }

  function cancelProcedure(ac) {
    if (ac.app && ac.app.phase !== 'none') {
      ac.app = emptyApp();
      ac.landClr = false;
    }
    ac.estabAnnounced = false;
  }

  function setProcedure(ac, type, rwy) {
    ac.app = { phase: 'cleared', rwy, type };
    ac.landClr = false;
    ac.estabAnnounced = false;
  }

  // ---------- Navigation Planner ----------
  function maintainHeading(ac) {
    ac.nav = { mode: 'hdg', hdg: ac.hdg, turn: null };
  }

  function captureFlightPlan(ac) {
    if (!ac) return null;
    if (ac.star && DATA.STARS[ac.star]) {
      ac.flightPlan = {
        type: 'star',
        name: ac.star,
        route: DATA.STARS[ac.star].route.map(r => r.fix),
      };
      return ac.flightPlan;
    }
    if (ac.sid && DATA.SIDS[ac.sid]) {
      ac.flightPlan = {
        type: 'sid',
        name: ac.sid,
        route: DATA.SIDS[ac.sid].route.slice(),
      };
      return ac.flightPlan;
    }
    if (ac.nav && ac.nav.mode === 'route' && ac.nav.route && ac.nav.route.length) {
      ac.flightPlan = {
        type: (ac.flightPlan && ac.flightPlan.type) || 'route',
        name: (ac.flightPlan && ac.flightPlan.name) || null,
        route: ac.nav.route.slice(ac.nav.idx || 0),
      };
      return ac.flightPlan;
    }
    return ac.flightPlan || null;
  }

  function getFlightPlan(ac) {
    if (ac.flightPlan && ac.flightPlan.route && ac.flightPlan.route.length)
      return ac.flightPlan;
    return captureFlightPlan(ac);
  }

  function isFollowingPlan(ac) {
    const plan = getFlightPlan(ac);
    if (!plan || !ac.nav || ac.nav.mode !== 'route') return false;
    const route = ac.nav.route;
    if (!route || !route.length) return false;
    const i = plan.route.indexOf(route[0]);
    if (i < 0) return false;
    for (let k = 0; k < route.length; k++) {
      if (plan.route[i + k] !== route[k]) return false;
    }
    if (plan.type === 'star' && ac.star && ac.star !== plan.name) return false;
    if (plan.type === 'sid' && ac.sid && ac.sid !== plan.name) return false;
    return true;
  }

  function canResume(ac) {
    if (!ac || !ac.airborne || ac.state === 'done') return false;
    if (ac.kind === 'hel') return false;
    const plan = getFlightPlan(ac);
    if (!plan || !plan.route || !plan.route.length) return false;
    return !isFollowingPlan(ac);
  }

  function clearStar(ac) {
    if (!ac.star) return false;
    captureFlightPlan(ac);
    ac.star = null;
    ac.via = false;
    if (ac.nav && ac.nav.mode === 'route') maintainHeading(ac);
    return true;
  }

  /** Vetores radar: abandona STAR e procedimento; mantém proa. */
  function toRadarVectors(ac) {
    if (typeof ac.clearHover === 'function') ac.clearHover();
    captureFlightPlan(ac);
    clearStar(ac);
    cancelProcedure(ac);
    ac.sidEngaged = true;
    maintainHeading(ac);
  }

  /**
   * Retoma STAR/SID/rota planejada pelo fixo mais próximo.
   */
  function resumeOwnNavigation(ac) {
    if (!ac.airborne) return ops('ainda no solo');
    if (ac.kind === 'hel') return ops('navegação própria não aplicável a este tráfego');
    const plan = getFlightPlan(ac);
    if (!plan || !plan.route || !plan.route.length)
      return ops('não temos rota planejada para retomar');
    if (isFollowingPlan(ac))
      return { rb: 'Já na navegação planejada' };

    if (typeof ac.clearHover === 'function') ac.clearHover();
    // sai de espera/vetor
    const join = typeof ac.nearestOf === 'function'
      ? ac.nearestOf(plan.route)
      : plan.route[0];
    const i = plan.route.indexOf(join);
    const route = plan.route.slice(i >= 0 ? i : 0);

    if (plan.type === 'star') {
      ac.star = plan.name;
      ac.via = false;
    } else if (plan.type === 'sid') {
      ac.sid = plan.name;
      ac.sidEngaged = true;
    }
    ac.nav = { mode: 'route', route, idx: 0 };
    if (typeof ac.clearPilotAsk === 'function') ac.clearPilotAsk();

    let where = 'direto ' + join;
    if (plan.type === 'star' && plan.name) where += ', STAR ' + plan.name;
    else if (plan.type === 'sid' && plan.name) where += ', SID ' + plan.name;
    return { rb: 'Retomando navegação, ' + where };
  }

  function cmdResumeNav(ac) {
    return resumeOwnNavigation(ac);
  }

  // ---------- Approach Manager (visual / sight) ----------
  function distToAirport(ac) {
    return U.dist(0, 0, ac.x, ac.y);
  }

  function canSeeAirport(ac) {
    return !!(ac.airborne && distToAirport(ac) <= SIGHT_NM);
  }

  function markAirportInSight(ac) {
    ac.airportInSight = true;
    ac.sightRequested = false;
  }

  /**
   * ATC: REPORTE AEROPORTO — se já à vista, piloto confirma na hora;
   * senão marca pedido e reporta ao entrar na distância visual.
   */
  function requestAirportInSight(ac) {
    if (!ac.airborne) return ops('ainda no solo');
    if (ac.kind !== 'arr' && ac.kind !== 'hel')
      return ops('reporte de aeroporto à vista só para chegadas');
    if (ac.airportInSight || canSeeAirport(ac)) {
      markAirportInSight(ac);
      return { rb: 'Aeroporto à vista' };
    }
    ac.sightRequested = true;
    return { rb: 'Reportaremos aeroporto à vista' };
  }

  /** Tick: cumpre pedido de reporte quando entra na distância visual. */
  function tickSight(ac, game) {
    if (!ac || !ac.airborne || !ac.sightRequested || ac.airportInSight) return;
    if (!canSeeAirport(ac)) return;
    markAirportInSight(ac);
    if (game && typeof game.radioPilot === 'function')
      game.radioPilot(ac, 'aeroporto à vista');
  }

  /**
   * Visual exige aeroporto à vista. Se já está perto o bastante, assume sight.
   */
  function ensureSightForVisual(ac) {
    if (ac.airportInSight) return null;
    if (canSeeAirport(ac)) {
      markAirportInSight(ac);
      return null;
    }
    return ops('sem aeroporto à vista — peça REPORTE AEROPORTO ou aproxime o tráfego');
  }

  function validateRwy(rwy) {
    if (!DATA.RUNWAYS[rwy]) return input('Pista ' + rwy + ' indisponível');
    return null;
  }

  function validateEmg(ac, rwy) {
    if (typeof Emergency !== 'undefined' && Emergency.validateApproach) {
      const emgErr = Emergency.validateApproach(ac, rwy);
      if (emgErr) return ops(emgErr);
    }
    return null;
  }

  // ---------- Comandos (estado + readback) ----------
  function cmdIls(ac, rwy) {
    if (!ac.airborne) return ops('impossível na fase atual');
    const bad = validateRwy(rwy) || validateEmg(ac, rwy);
    if (bad) return bad;
    const prev = ac.app && ac.app.rwy;
    const prevType = ac.app && ac.app.type;
    setProcedure(ac, TYPES.ILS, rwy);
    if (typeof ac.clearPilotAsk === 'function') ac.clearPilotAsk();
    if (prevType === 'visual')
      return { rb: 'Cancelando visual, autorizado ILS pista ' + rwy };
    if (prev && prev !== rwy)
      return { rb: 'Mudando para ILS pista ' + rwy };
    return { rb: 'Autorizado ILS pista ' + rwy };
  }

  function cmdVisual(ac, rwy) {
    if (!ac.airborne) return ops('impossível na fase atual');
    if (ac.kind !== 'arr' && ac.kind !== 'hel')
      return ops('aproximação visual só para chegadas');
    const bad = validateRwy(rwy) || validateEmg(ac, rwy);
    if (bad) return bad;
    const sightErr = ensureSightForVisual(ac);
    if (sightErr) return sightErr;
    const prev = ac.app && ac.app.rwy;
    setProcedure(ac, TYPES.VISUAL, rwy);
    if (typeof ac.clearPilotAsk === 'function') ac.clearPilotAsk();
    if (prev && prev !== rwy)
      return { rb: 'Mudando para aproximação visual pista ' + rwy };
    return { rb: 'Autorizado aproximação visual pista ' + rwy };
  }

  function cmdCancelVisual(ac) {
    if (!ac.airborne) return ops('ainda no solo');
    if (!ac.app || ac.app.phase === 'none' || ac.app.type !== 'visual')
      return ops('não estamos em aproximação visual');
    cancelProcedure(ac);
    maintainHeading(ac);
    if (typeof ac.clearPilotAsk === 'function') ac.clearPilotAsk();
    return { rb: 'Cancelando aproximação visual, aguardando instruções' };
  }

  function cmdCancelStar(ac) {
    if (ac.kind !== 'arr') return ops('somos uma saída, não temos STAR');
    if (!ac.star) return ops('não temos STAR designada');
    const name = ac.star;
    clearStar(ac);
    if (typeof ac.clearPilotAsk === 'function') ac.clearPilotAsk();
    return { rb: 'Cancelando STAR ' + name + ', aguardando instruções' };
  }

  function cmdRadarVectors(ac) {
    if (!ac.airborne) return ops('ainda no solo');
    toRadarVectors(ac);
    if (typeof ac.clearPilotAsk === 'function') ac.clearPilotAsk();
    return { rb: 'Vetores radar, mantendo proa ' + U.fmtHdg(ac.hdg) };
  }

  function cmdChangeRunway(ac, rwy) {
    if (!ac.airborne) return ops('impossível na fase atual');
    const bad = validateRwy(rwy);
    if (bad) return bad;
    if (ac.app && ac.app.phase !== 'none') {
      if (ac.app.rwy === rwy)
        return ops('já estamos na aproximação da pista ' + rwy);
      if (ac.app.type === 'visual') return cmdVisual(ac, rwy);
      return cmdIls(ac, rwy);
    }
    return cmdIls(ac, rwy);
  }

  function cmdProcApproach(kind, ac, rwy) {
    const label = kind === 'VOR' ? 'VOR' : 'RNAV';
    if (!ac.airborne) return ops('impossível na fase atual');
    const bad = validateRwy(rwy);
    if (bad) return bad;
    // Extensível: quando o JSON publicar cartas RNAV/VOR, setProcedure(TYPES.RNAV/VOR)
    return ops(
      'procedimento ' + label + ' pista ' + rwy +
      ' não publicado neste aeroporto — use ILS ou aproximação visual'
    );
  }

  function establishedPhrase(ac) {
    if (!ac.app || ac.app.phase === 'none') return null;
    if (ac.app.type === 'visual')
      return 'estabelecido na aproximação visual pista ' + ac.app.rwy;
    return 'estabelecido no localizador ILS ' + ac.app.rwy;
  }

  return {
    TYPES,
    SIGHT_NM,
    emptyApp,
    cancelProcedure,
    setProcedure,
    clearStar,
    toRadarVectors,
    maintainHeading,
    canSeeAirport,
    markAirportInSight,
    requestAirportInSight,
    tickSight,
    ensureSightForVisual,
    cmdIls,
    cmdVisual,
    cmdCancelVisual,
    cmdCancelStar,
    cmdRadarVectors,
    cmdChangeRunway,
    cmdProcApproach,
    captureFlightPlan,
    getFlightPlan,
    canResume,
    isFollowingPlan,
    resumeOwnNavigation,
    cmdResumeNav,
    establishedPhrase,
  };
})();

if (typeof globalThis !== 'undefined') globalThis.Approach = Approach;
if (typeof module !== 'undefined') module.exports = { Approach };
