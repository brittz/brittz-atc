// ============================================================
// Emergency Response Manager — despacho, pedidos do piloto, fases
// Complementa Emergency System V2 (não substitui falhas/declaração).
// ============================================================
'use strict';

if (typeof DATA === 'undefined' && typeof require !== 'undefined') {
  const _d = require('./data.js');
  globalThis.DATA = _d.DATA;
  globalThis.U = _d.U;
}
if (typeof EmergencyUnits === 'undefined' && typeof require !== 'undefined') {
  globalThis.EmergencyUnits = require('./emergency_units.js').EmergencyUnits;
}
if (typeof RunwayState === 'undefined' && typeof require !== 'undefined') {
  globalThis.RunwayState = require('./runway_state.js').RunwayState;
}

const EmergencyResponse = (() => {
  const PHASES = [
    'idle', 'standby', 'dispatched', 'staged', 'on_scene', 'recovering', 'complete',
  ];

  const ASSIST_LABELS = {
    none: 'sem assistência em solo',
    fire: 'solicitamos bombeiros na pista',
    medical: 'solicitamos assistência médica',
    inspection: 'solicitamos apenas inspeção visual',
    full: 'solicitamos operação completa de emergência',
  };

  function cannotVacate(emg) {
    if (!emg || !emg.active) return false;
    const kind = emg.kind || '';
    const sev = emg.severity || 'medium';
    const criticalKinds = new Set([
      'engine-fire', 'landing-gear', 'cockpit-smoke', 'bomb-threat',
    ]);
    if (criticalKinds.has(kind)) return true;
    if (kind === 'hydraulic-failure' && (sev === 'high' || sev === 'critical')) return true;
    if (kind === 'cabin-smoke' && sev === 'critical') return true;
    if (emg.outcome === 'evacuação') return true;
    return false;
  }

  function blockReasonFor(emg) {
    if (!emg) return 'emergency';
    if (emg.kind === 'engine-fire' || emg.kind === 'cockpit-smoke') return 'fire';
    if (emg.kind === 'landing-gear') return 'gear-collapse';
    if (emg.outcome === 'evacuação') return 'disabled-aircraft';
    return 'disabled-aircraft';
  }

  function defaultAssistance(emg) {
    if (!emg) return 'none';
    const kind = emg.kind || '';
    if (kind === 'engine-fire' || kind === 'cockpit-smoke' || kind === 'cabin-smoke') return 'fire';
    if (kind === 'medical') return 'medical';
    if (kind === 'landing-gear' || kind === 'hydraulic-failure') return 'inspection';
    if (kind === 'bomb-threat') return 'full';
    if (emg.severity === 'critical' || emg.severity === 'high') return 'fire';
    return 'none';
  }

  function createOccurrence(ac, game) {
    const assist = defaultAssistance(ac.emergency);
    return {
      cs: ac.cs,
      phase: 'standby',
      assistance: assist,
      assistanceRequested: false,
      dispatched: { arff: false, ambulance: false, medical: false, ops: false },
      unitIds: [],
      openedAt: game ? game.time : 0,
      stagedAnnounced: false,
      readyAnnounced: false,
      closedAt: 0,
      rwy: (ac.emergency && ac.emergency.info && ac.emergency.info.runway) || ac.rwy || null,
    };
  }

  function create(game) {
    return {
      occurrences: {}, // cs -> occurrence
      units: [],
      messages: [],
    };
  }

  function open(mgr, ac, game) {
    if (!mgr || !ac) return null;
    if (mgr.occurrences[ac.cs]) return mgr.occurrences[ac.cs];
    const occ = createOccurrence(ac, game);
    mgr.occurrences[ac.cs] = occ;
    return occ;
  }

  function get(mgr, cs) {
    return mgr && mgr.occurrences ? mgr.occurrences[cs] : null;
  }

  function findUnit(mgr, type, cs) {
    return (mgr.units || []).find(u =>
      u.type === type && (u.targetCs === cs || u.phase === 'at_base'));
  }

  function ensureUnit(mgr, type, rwy, cs) {
    let u = (mgr.units || []).find(x =>
      x.type === type && x.targetCs === cs && x.phase !== 'at_base' && x.phase !== 'returning');
    if (u) return u;
    // reutiliza unidade no base do mesmo tipo
    u = (mgr.units || []).find(x => x.type === type && x.phase === 'at_base');
    if (!u) {
      u = EmergencyUnits.createUnit(type, { targetRwy: rwy, targetCs: cs });
      mgr.units.push(u);
    }
    EmergencyUnits.dispatch(u, rwy, cs);
    return u;
  }

  function setAssistance(mgr, ac, kind, game) {
    const occ = open(mgr, ac, game);
    if (!occ) return null;
    if (!ASSIST_LABELS[kind]) kind = 'none';
    occ.assistance = kind;
    occ.assistanceRequested = true;
    return { text: ASSIST_LABELS[kind], assistance: kind };
  }

  function maybePilotAssistance(mgr, ac, game) {
    if (!mgr || !ac || !ac.emergency || !ac.emergency.active) return null;
    const occ = open(mgr, ac, game);
    if (!occ || occ.assistanceRequested) return null;
    const e = ac.emergency;
    // pedidos espontâneos: após declaração, em aproximação, ou pós-pouso
    const stage = e.stage || 'declared';
    const trigger =
      (stage === 'declared' && e.answers && e.answers.nature) ||
      stage === 'approach' ||
      stage === 'landing' ||
      stage === 'post-landing' ||
      ac.state === 'rollout';
    if (!trigger) return null;
    occ.assistanceRequested = true;
    const kind = defaultAssistance(e);
    occ.assistance = kind;
    if (kind === 'none')
      return { text: 'não necessitamos de assistência em solo no momento', assistance: kind };
    return { text: ASSIST_LABELS[kind], assistance: kind };
  }

  function resolveRwy(ac, game) {
    if (ac.rwy && DATA.RUNWAYS[ac.rwy]) return ac.rwy;
    if (ac.app && ac.app.rwy) return ac.app.rwy;
    if (ac.emergency && ac.emergency.info && ac.emergency.info.runway)
      return ac.emergency.info.runway;
    const cfg = game && DATA.CONFIGS[game.cfg];
    return cfg ? cfg.arrRwy : Object.keys(DATA.RUNWAYS || {})[0];
  }

  function dispatchTypes(mgr, ac, game, types) {
    if (!mgr || !ac) return { err: 'sem aeronave' };
    if (!ac.emergency || !ac.emergency.active)
      return { err: 'negativo, sem emergência ativa para ' + ac.cs };
    const occ = open(mgr, ac, game);
    const rwy = resolveRwy(ac, game);
    occ.rwy = rwy;
    const dispatched = [];
    for (const t of types) {
      if (!EmergencyUnits.UNIT_TYPES[t]) continue;
      ensureUnit(mgr, t, rwy, ac.cs);
      occ.dispatched[t] = true;
      if (!occ.unitIds.includes(t)) occ.unitIds.push(t);
      dispatched.push(EmergencyUnits.profile(t).label);
    }
    if (!dispatched.length) return { err: 'nenhuma equipe válida' };
    if (occ.phase === 'standby' || occ.phase === 'idle') occ.phase = 'dispatched';
    const labels = dispatched.join(', ');
    if (game && game.emit) {
      game.emit({
        type: 'radio', who: 'sys',
        text: 'Equipes despachadas para ' + ac.cs + ': ' + labels + ' (pista ' + rwy + ').',
        cls: 'bad',
      });
    }
    return {
      rb: 'equipes acionadas',
      atc: 'acionando ' + labels.toLowerCase() + ' para ' + ac.cs,
      dispatched,
    };
  }

  function dispatchFire(mgr, ac, game) {
    return dispatchTypes(mgr, ac, game, ['arff']);
  }
  function dispatchAmbulance(mgr, ac, game) {
    return dispatchTypes(mgr, ac, game, ['ambulance']);
  }
  function dispatchMedical(mgr, ac, game) {
    return dispatchTypes(mgr, ac, game, ['medical']);
  }
  function dispatchFull(mgr, ac, game) {
    return dispatchTypes(mgr, ac, game, ['arff', 'ambulance', 'medical', 'ops']);
  }

  function onTouchdown(mgr, ac, game) {
    if (!mgr || !ac || !ac.emergency) return;
    const occ = open(mgr, ac, game);
    const rwy = ac.rwy || resolveRwy(ac, game);
    occ.rwy = rwy;
    const stuck = cannotVacate(ac.emergency);
    if (stuck && game.runwayMgr) {
      RunwayState.block(game.runwayMgr, rwy, blockReasonFor(ac.emergency), ac.cs, 0);
      if (game.emit) {
        game.emit({
          type: 'radio', who: 'sys',
          text: ac.cs + ': aeronave imobilizada na pista ' + rwy + ' — faixa bloqueada.',
          cls: 'bad',
        });
      }
    }
    // unidades já despachadas entram e aproximam
    const mine = (mgr.units || []).filter(u => u.targetCs === ac.cs);
    for (const u of mine) {
      if (u.phase === 'staging' || u.phase === 'enroute_staging') {
        EmergencyUnits.enterRunway(u);
        EmergencyUnits.approachAircraft(u, ac);
      } else if (u.phase === 'entering') {
        EmergencyUnits.approachAircraft(u, ac);
      }
    }
    // pedido do piloto fica registrado; despacho continua a cargo do ATC
  }

  function onVacated(mgr, ac, game) {
    if (!mgr || !ac) return;
    const occ = get(mgr, ac.cs);
    if (!occ) return;
    if (game.runwayMgr && occ.rwy) {
      RunwayState.startInspection(game.runwayMgr, occ.rwy, game.time + U.rnd(20, 35));
      if (game.emit) {
        game.emit({
          type: 'radio', who: 'sys',
          text: 'Pista ' + occ.rwy + ' em inspeção após ' + ac.cs + '.',
          cls: 'warn',
        });
      }
    }
    occ.phase = 'recovering';
  }

  function unitsFor(mgr, cs) {
    return (mgr.units || []).filter(u => u.targetCs === cs ||
      (u.targetCs == null && mgr.occurrences[cs] && mgr.occurrences[cs].unitIds.includes(u.type)));
  }

  function canEnd(mgr, ac, game) {
    if (!ac || !ac.emergency) return { ok: false, reason: 'sem emergência' };
    const occ = get(mgr, ac.cs);
    if (!occ) {
      return { ok: true };
    }
    const onRwy = ['rollout', 'abort', 'lineup', 'takeoff'].includes(ac.state);
    const stuck = cannotVacate(ac.emergency) && onRwy &&
      !(ac.emergency.flags && ac.emergency.flags.vacateAllowedAfterResponse);
    if (stuck) return { ok: false, reason: 'aeronave ainda imobilizada na pista' };

    // aeronave já livrou / saiu: permite encerrar e recall das equipes
    if (!onRwy && ac.state !== 'takeoff')
      return { ok: true };

    const mine = (mgr.units || []).filter(u => u.targetCs === ac.cs);
    const stillWorking = mine.some(u =>
      ['entering', 'approaching'].includes(u.phase) ||
      (u.phase === 'on_scene' && u.onSceneUntil > game.time));
    if (stillWorking)
      return { ok: false, reason: 'equipes ainda em operação' };

    if (game.runwayMgr && occ.rwy && onRwy) {
      const st = RunwayState.get(game.runwayMgr, occ.rwy);
      if (st.state === 'blocked')
        return { ok: false, reason: 'pista ainda bloqueada' };
    }
    return { ok: true };
  }

  function tryEnd(mgr, ac, game, force) {
    if (!mgr || !ac) return { err: 'sem aeronave' };
    if (!ac.emergency || (!ac.emergency.active && ac.emergency.stage === 'closed'))
      return { err: 'emergência já encerrada' };

    const check = force ? { ok: true } : canEnd(mgr, ac, game);
    if (!check.ok) return { err: check.reason || 'ainda não é seguro encerrar' };

    const occ = get(mgr, ac.cs) || open(mgr, ac, game);
    // recall units
    for (const u of (mgr.units || []).filter(x => x.targetCs === ac.cs)) {
      if (u.phase !== 'at_base') EmergencyUnits.recall(u);
    }
    if (game.runwayMgr && occ.rwy) {
      const st = RunwayState.get(game.runwayMgr, occ.rwy);
      if (st.state === 'blocked' || st.state === 'inspecting')
        RunwayState.markCleared(game.runwayMgr, occ.rwy, game.time + 5);
    }
    occ.phase = 'complete';
    occ.closedAt = game.time;
    if (game.finishEmergency)
      game.finishEmergency(ac, ac.emergency.outcome || 'encerramento', 'resposta de emergência concluída');
    if (game.emit) {
      game.emit({
        type: 'radio', who: 'sys',
        text: 'Emergência de ' + ac.cs + ' encerrada. Equipes retornando. Operações em recuperação.',
        cls: 'good',
      });
    }
    return {
      rb: 'emergência encerrada, obrigado',
      atc: 'encerrando a emergência de ' + ac.cs,
    };
  }

  function update(mgr, game, dt) {
    if (!mgr || !game) return;
    EmergencyUnits.updateAll(mgr.units, game, dt);

    for (const [cs, occ] of Object.entries(mgr.occurrences)) {
      if (occ.phase === 'complete') continue;
      const ac = game.aircraft.find(a => a.cs === cs);
      const mine = (mgr.units || []).filter(u => u.targetCs === cs);

      if (mine.length && mine.every(u => u.phase === 'staging' || u.phase === 'on_scene' ||
          u.phase === 'approaching' || u.phase === 'entering' || u.phase === 'returning' ||
          u.phase === 'at_base')) {
        if (!occ.stagedAnnounced && mine.some(u => u.phase === 'staging')) {
          occ.stagedAnnounced = true;
          occ.phase = 'staged';
          if (game.emit) {
            game.emit({
              type: 'radio', who: 'sys',
              text: 'Equipes posicionadas (staging) para ' + cs + (occ.rwy ? ', pista ' + occ.rwy : '') + '.',
              cls: 'bad',
            });
          }
        }
      }

      if (!occ.readyAnnounced && mine.some(u => u.phase === 'staging')) {
        const allStaged = mine.filter(u => occ.dispatched[u.type]).every(u =>
          ['staging', 'entering', 'approaching', 'on_scene', 'returning', 'at_base'].includes(u.phase));
        if (allStaged && mine.length) {
          occ.readyAnnounced = true;
          if (game.emit) {
            game.emit({
              type: 'radio', who: 'sys',
              text: 'Equipes prontas para ' + cs + '.',
              cls: 'good',
            });
          }
        }
      }

      if (mine.some(u => u.phase === 'on_scene')) occ.phase = 'on_scene';

      // pós-serviço com aeronave imobilizada: liberar vacate após on_scene
      if (ac && ac.emergency && cannotVacate(ac.emergency) && ac.state === 'rollout') {
        const doneService = mine.length && mine.every(u =>
          u.phase === 'returning' || u.phase === 'at_base' ||
          (u.phase === 'on_scene' && u.onSceneUntil && game.time >= u.onSceneUntil));
        if (doneService || (mine.length && mine.every(u =>
          u.phase === 'returning' || u.phase === 'at_base'))) {
          ac.emergency.flags = ac.emergency.flags || {};
          if (!ac.emergency.flags.vacateAllowedAfterResponse) {
            ac.emergency.flags.vacateAllowedAfterResponse = true;
            if (game.runwayMgr && occ.rwy)
              RunwayState.startInspection(game.runwayMgr, occ.rwy, game.time + U.rnd(22, 38));
            if (game.emit) {
              game.emit({
                type: 'radio', who: 'sys',
                text: cs + ': serviço em solo concluído — inspeção da pista ' + (occ.rwy || '') + '.',
                cls: 'good',
              });
              game.radioPilot(ac, 'prontos para livrar a pista quando autorizado', 0.8);
            }
          }
        }
      }

      // limpa ocorrência se aeronave sumiu e tudo na base
      if (!ac && EmergencyUnits.allAtBase(mine)) {
        occ.phase = 'complete';
      }
    }

    // remove unidades ociosas antigas na base (mantém pool pequeno)
    if (mgr.units.length > 12) {
      mgr.units = mgr.units.filter(u => u.phase !== 'at_base' ||
        Object.values(mgr.occurrences).some(o => o.phase !== 'complete' && o.unitIds.includes(u.type)));
    }
  }

  function serialize(mgr) {
    if (!mgr) return null;
    const occurrences = {};
    for (const [cs, o] of Object.entries(mgr.occurrences || {})) {
      occurrences[cs] = {
        cs: o.cs,
        phase: o.phase,
        assistance: o.assistance,
        assistanceRequested: !!o.assistanceRequested,
        dispatched: { ...o.dispatched },
        unitIds: (o.unitIds || []).slice(),
        openedAt: o.openedAt,
        stagedAnnounced: !!o.stagedAnnounced,
        readyAnnounced: !!o.readyAnnounced,
        closedAt: o.closedAt,
        rwy: o.rwy,
      };
    }
    return {
      occurrences,
      units: EmergencyUnits.serialize(mgr.units),
    };
  }

  function hydrate(raw) {
    const mgr = create();
    if (!raw) return mgr;
    mgr.units = EmergencyUnits.hydrate(raw.units || []);
    for (const [cs, o] of Object.entries(raw.occurrences || {})) {
      mgr.occurrences[cs] = {
        cs: o.cs || cs,
        phase: o.phase || 'standby',
        assistance: o.assistance || 'none',
        assistanceRequested: !!o.assistanceRequested,
        dispatched: {
          arff: false, ambulance: false, medical: false, ops: false,
          ...(o.dispatched || {}),
        },
        unitIds: (o.unitIds || []).slice(),
        openedAt: o.openedAt || 0,
        stagedAnnounced: !!o.stagedAnnounced,
        readyAnnounced: !!o.readyAnnounced,
        closedAt: o.closedAt || 0,
        rwy: o.rwy || null,
      };
    }
    return mgr;
  }

  function quickActions(mgr, ac) {
    if (!ac || !ac.emergency || !ac.emergency.active) return [];
    const occ = mgr ? get(mgr, ac.cs) : null;
    const acts = [];
    if (!occ || !occ.dispatched.arff)
      acts.push({ label: 'Acionar Bombeiros', cmd: 'DISPATCH_FIRE', cls: 'emg' });
    if (!occ || !occ.dispatched.ambulance)
      acts.push({ label: 'Acionar Ambulância', cmd: 'DISPATCH_AMBULANCE', cls: 'emg' });
    if (!occ || !occ.dispatched.medical)
      acts.push({ label: 'Acionar Equipe Médica', cmd: 'DISPATCH_MEDICAL', cls: 'emg' });
    if (!occ || !occ.dispatched.arff || !occ.dispatched.medical)
      acts.push({ label: 'Operação Completa', cmd: 'DISPATCH_FULL', cls: 'emg' });
    acts.push({ label: 'Encerrar Emergência', cmd: 'END_EMERGENCY', cls: 'bad' });
    return acts;
  }

  return {
    PHASES,
    ASSIST_LABELS,
    cannotVacate,
    blockReasonFor,
    defaultAssistance,
    create,
    open,
    get,
    setAssistance,
    maybePilotAssistance,
    dispatchFire,
    dispatchAmbulance,
    dispatchMedical,
    dispatchFull,
    dispatchTypes,
    onTouchdown,
    onVacated,
    canEnd,
    tryEnd,
    update,
    serialize,
    hydrate,
    quickActions,
  };
})();

if (typeof module !== 'undefined') module.exports = { EmergencyResponse };
