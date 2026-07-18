// ============================================================
// Emergency Traffic Manager — restrições contextuais durante emergência
// Único ponto que decide bloquear decolagem por MAYDAY (além de
// RunwayState / emergencyRunwayBlock físicos).
// ============================================================
'use strict';

if (typeof Separation === 'undefined' && typeof require !== 'undefined') {
  globalThis.Separation = require('./separation.js').Separation;
}
if (typeof RunwayState === 'undefined' && typeof require !== 'undefined') {
  globalThis.RunwayState = require('./runway_state.js').RunwayState;
}
if (typeof DATA === 'undefined' && typeof require !== 'undefined') {
  const _d = require('./data.js');
  globalThis.DATA = _d.DATA;
  globalThis.U = _d.U;
}

const EmergencyTraffic = (() => {
  // Distâncias (NM ao aeródromo / à pista) para reavaliação dinâmica
  const CLOSE_NM = 12;   // dentro: mesma faixa restrita
  const FAR_NM = 18;     // além: mesma faixa ainda pode liberar decolagem

  function activeEmergencies(game) {
    return (game.aircraft || []).filter(a =>
      a && a.state !== 'done' && a.emergency && a.emergency.active);
  }

  function emergencyRunway(ac, game) {
    if (!ac) return null;
    if (ac.emergency && ac.emergency.info && ac.emergency.info.runway)
      return ac.emergency.info.runway;
    if (ac.app && ac.app.rwy) return ac.app.rwy;
    if (ac.rwy) return ac.rwy;
    const cfg = game && DATA.CONFIGS[game.cfg];
    return (cfg && cfg.arrRwy) || null;
  }

  function distToField(ac) {
    return U.dist(0, 0, ac.x, ac.y);
  }

  function onEmergencyRunway(ac) {
    return ['lineup', 'takeoff', 'rollout', 'abort'].includes(ac.state);
  }

  function lateApproach(ac) {
    if (!ac.airborne || !ac.app) return false;
    return ac.app.phase === 'loc' || ac.app.phase === 'gs' || ac.app.phase === 'cleared';
  }

  function stripsIndependent(stripA, stripB) {
    if (!stripA || !stripB || stripA === stripB) return false;
    if (typeof Separation === 'undefined') return false;
    const g = Separation.findParallelGroup
      ? Separation.findParallelGroup(stripA, stripB)
      : null;
    if (!g) {
      // fallback: varrer cfg como Separation.isExempt
      const ops = (Separation.cfg && Separation.cfg().parallelOps) || [];
      for (const op of ops) {
        const strips = op.strips || [];
        if (strips.includes(stripA) && strips.includes(stripB)) {
          return !!(op.mixedArrivalDeparture || op.independentApproaches || op.simultaneousTakeoffs);
        }
      }
      return false;
    }
    return !!(g.mixedArrivalDeparture || g.independentApproaches || g.simultaneousTakeoffs);
  }

  /**
   * Avalia se a decolagem em `rwy` deve ser retida.
   * @returns {{ hold: boolean, reason: string|null, temporary: boolean, untilHint: string|null }}
   */
  function evaluateDeparture(game, rwy, except) {
    if (!game || !rwy) return allow();

    const pair = DATA.RWY_PAIR[rwy];

    // Bloqueio físico / pós-pouso no mesmo pair
    if (game.emergencyRunwayBlock && game.emergencyRunwayBlock.until > game.time
      && game.emergencyRunwayBlock.pair === pair) {
      return deny('pista temporariamente indisponível por operação de emergência', true);
    }
    if (game.runwayMgr && typeof RunwayState !== 'undefined'
      && RunwayState.isUnavailable(game.runwayMgr, rwy, game)) {
      const e = RunwayState.get(game.runwayMgr, rwy);
      const why = e && e.state === 'inspecting' ? 'pista em inspeção'
        : e && e.state === 'blocked' ? 'pista bloqueada por operação de emergência'
        : 'pista temporariamente indisponível';
      return deny(why, true);
    }

    const emgs = activeEmergencies(game).filter(a => a !== except);
    if (!emgs.length) return allow();

    for (const emg of emgs) {
      const hit = assessVsEmergency(game, emg, rwy, 'departure');
      if (hit.hold) return hit;
    }
    return allow();
  }

  function assessVsEmergency(game, emg, rwy, _op) {
    const emgRwy = emergencyRunway(emg, game);
    const emgStrip = emgRwy ? (DATA.RWY_PAIR[emgRwy] || emgRwy) : null;
    const tgtStrip = DATA.RWY_PAIR[rwy] || rwy;
    const d = distToField(emg);
    const stage = (emg.emergency && emg.emergency.stage) || '';
    const sev = (emg.emergency && emg.emergency.severity) || 'medium';

    // Emergência já na pista (qualquer faixa): só bloqueia a faixa ocupada
    if (onEmergencyRunway(emg)) {
      const occStrip = DATA.RWY_PAIR[emg.rwy] || emg.rwy;
      if (occStrip === tgtStrip)
        return deny('aguarde, aeronave em emergência ainda na pista ' + emg.rwy, true);
      if (stripsIndependent(occStrip, tgtStrip)) return allow();
      return deny('aguarde liberação operacional da emergência ' + emg.cs, true);
    }

    // Faixas paralelas independentes: mantém fluxo
    if (emgStrip && emgStrip !== tgtStrip && stripsIndependent(emgStrip, tgtStrip))
      return allow();

    // Mesma faixa (ou paralela sem independência)
    const sameStrip = !emgStrip || emgStrip === tgtStrip;

    if (!sameStrip) {
      // Dependentes e emergência ainda longe: libera
      if (d > FAR_NM && !lateApproach(emg) && stage !== 'landing' && stage !== 'post-landing')
        return allow();
      return deny('decolagem temporariamente indisponível devido à aproximação da emergência ' + emg.cs, true);
    }

    // --- mesma faixa ---
    if (stage === 'landing' || stage === 'post-landing')
      return deny('pista reservada para a emergência ' + emg.cs, true);

    if (lateApproach(emg) || stage === 'approach')
      return deny('decolagem temporariamente indisponível devido à aproximação da emergência ' + emg.cs, true);

    if (d <= CLOSE_NM)
      return deny('decolagem temporariamente indisponível devido à aproximação da emergência ' + emg.cs, true);

    if (d > FAR_NM)
      return allow();

    // Zona intermediária: só retém se severidade alta/crítica
    if (['high', 'critical'].includes(sev))
      return deny('decolagem temporariamente indisponível devido à aproximação da emergência ' + emg.cs, true);

    return allow();
  }

  function allow() {
    return { hold: false, reason: null, temporary: false, untilHint: null };
  }

  function deny(reason, temporary) {
    return { hold: true, reason: reason, temporary: !!temporary, untilHint: temporary ? 'aguarde liberação operacional' : null };
  }

  /** Compatível com GameCore.shouldHoldDeparture */
  function shouldHoldDeparture(game, rwy, except) {
    return evaluateDeparture(game, rwy, except).hold;
  }

  /** Motivo em português para PilotReply / UI */
  function departureHoldReason(game, rwy, except) {
    const r = evaluateDeparture(game, rwy, except);
    if (!r.hold) return null;
    return r.reason || 'aguarde liberação operacional';
  }

  /**
   * Resumo por pista para a UI (disponível / restrita + motivo).
   */
  function runwaySummary(game) {
    const out = {};
    if (!DATA.RUNWAYS) return out;
    for (const id of Object.keys(DATA.RUNWAYS)) {
      const ev = evaluateDeparture(game, id, null);
      let state = 'available';
      let reason = null;
      if (game.runwayMgr && typeof RunwayState !== 'undefined') {
        const e = RunwayState.get(game.runwayMgr, id);
        if (e.state === 'blocked' || e.state === 'inspecting') {
          state = e.state;
          reason = RunwayState.reasonLabel(e.reason) || e.label;
        } else if (e.state === 'occupied') {
          state = 'occupied';
        }
      }
      if (ev.hold && state === 'available') {
        state = 'restricted';
        reason = ev.reason;
      }
      out[id] = { state, reason, temporary: !!ev.temporary };
    }
    return out;
  }

  return {
    CLOSE_NM,
    FAR_NM,
    evaluateDeparture,
    shouldHoldDeparture,
    departureHoldReason,
    runwaySummary,
    activeEmergencies,
    emergencyRunway,
    stripsIndependent,
  };
})();

if (typeof globalThis !== 'undefined') globalThis.EmergencyTraffic = EmergencyTraffic;
if (typeof module !== 'undefined') module.exports = { EmergencyTraffic };
