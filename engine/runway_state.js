// ============================================================
// Runway State Manager — estados por pista (independente de MAYDAY)
// free | occupied | blocked | inspecting | cleared
// ============================================================
'use strict';

if (typeof DATA === 'undefined' && typeof require !== 'undefined') {
  const _d = require('./data.js');
  globalThis.DATA = _d.DATA;
  globalThis.U = _d.U;
}

const RunwayState = (() => {
  const STATES = ['free', 'occupied', 'blocked', 'inspecting', 'cleared'];

  const LABELS = {
    free: 'Livre',
    occupied: 'Ocupada',
    blocked: 'Bloqueada',
    inspecting: 'Em inspeção',
    cleared: 'Liberada',
  };

  const BLOCK_REASONS = {
    'disabled-aircraft': 'aeronave imobilizada',
    'gear-collapse': 'trem de pouso',
    fire: 'incêndio',
    inspection: 'inspeção',
    ops: 'operacional',
    emergency: 'emergência',
  };

  function emptyEntry() {
    return {
      state: 'free',
      reason: null,
      blockedBy: null,
      until: 0,
      label: LABELS.free,
    };
  }

  function create(game) {
    const runways = {};
    const ids = DATA.RUNWAYS ? Object.keys(DATA.RUNWAYS) : [];
    for (const id of ids) runways[id] = emptyEntry();
    return { runways };
  }

  function ensure(mgr, rwy) {
    if (!mgr || !rwy) return null;
    if (!mgr.runways[rwy]) mgr.runways[rwy] = emptyEntry();
    return mgr.runways[rwy];
  }

  function setState(mgr, rwy, state, opts) {
    opts = opts || {};
    const e = ensure(mgr, rwy);
    if (!e || !STATES.includes(state)) return e;
    e.state = state;
    e.reason = opts.reason || null;
    e.blockedBy = opts.blockedBy || null;
    e.until = opts.until != null ? opts.until : 0;
    e.label = LABELS[state] || state;
    // espelha no par oposto quando o impacto é por faixa
    if (opts.pair !== false && DATA.RWY_PAIR && DATA.RUNWAYS[rwy]) {
      const opp = DATA.RUNWAYS[rwy].opp;
      if (opp && opp !== rwy) {
        const o = ensure(mgr, opp);
        if (o) {
          o.state = state;
          o.reason = e.reason;
          o.blockedBy = e.blockedBy;
          o.until = e.until;
          o.label = e.label;
        }
      }
    }
    return e;
  }

  function syncOccupied(mgr, game) {
    if (!mgr || !game) return;
    const occupiedPairs = new Set();
    for (const a of game.aircraft || []) {
      if (a.state === 'done' || !a.rwy) continue;
      if (['lineup', 'takeoff', 'rollout', 'abort'].includes(a.state))
        occupiedPairs.add(DATA.RWY_PAIR[a.rwy] || a.rwy);
    }
    for (const [id, e] of Object.entries(mgr.runways)) {
      if (e.state === 'blocked' || e.state === 'inspecting') continue;
      if (e.state === 'cleared' && e.until > game.time) continue;
      const pair = DATA.RWY_PAIR[id] || id;
      if (occupiedPairs.has(pair)) {
        if (e.state === 'free' || e.state === 'cleared')
          setState(mgr, id, 'occupied', { pair: false, reason: 'aircraft' });
      } else if (e.state === 'occupied') {
        setState(mgr, id, 'free', { pair: false });
      }
    }
  }

  function block(mgr, rwy, reason, blockedBy, until) {
    return setState(mgr, rwy, 'blocked', {
      reason: reason || 'emergency',
      blockedBy: blockedBy || null,
      until: until || 0,
    });
  }

  function startInspection(mgr, rwy, until) {
    return setState(mgr, rwy, 'inspecting', {
      reason: 'inspection',
      until: until || 0,
    });
  }

  function markCleared(mgr, rwy, until) {
    return setState(mgr, rwy, 'cleared', {
      reason: null,
      blockedBy: null,
      until: until || 0,
    });
  }

  function release(mgr, rwy) {
    return setState(mgr, rwy, 'free', { reason: null, blockedBy: null, until: 0 });
  }

  function get(mgr, rwy) {
    return ensure(mgr, rwy) || emptyEntry();
  }

  function isUnavailable(mgr, rwy, game) {
    if (!mgr || !rwy) return false;
    const e = get(mgr, rwy);
    if (e.state === 'blocked' || e.state === 'inspecting') return true;
    if (e.state === 'cleared' && game && e.until > game.time) return true;
    // também verifica o par
    const pair = DATA.RWY_PAIR && DATA.RWY_PAIR[rwy];
    if (pair) {
      for (const [id, ent] of Object.entries(mgr.runways)) {
        if ((DATA.RWY_PAIR[id] || id) !== pair) continue;
        if (ent.state === 'blocked' || ent.state === 'inspecting') return true;
        if (ent.state === 'cleared' && game && ent.until > game.time) return true;
      }
    }
    return false;
  }

  function reasonLabel(code) {
    return BLOCK_REASONS[code] || code || 'operacional';
  }

  function update(mgr, game, dt) {
    if (!mgr || !game) return;
    syncOccupied(mgr, game);
    for (const [id, e] of Object.entries(mgr.runways)) {
      if (e.state === 'cleared' && e.until > 0 && game.time >= e.until)
        release(mgr, id);
      if (e.state === 'inspecting' && e.until > 0 && game.time >= e.until)
        markCleared(mgr, id, game.time + 8);
    }
  }

  function serialize(mgr) {
    if (!mgr) return null;
    const out = {};
    for (const [id, e] of Object.entries(mgr.runways || {})) {
      out[id] = {
        state: e.state,
        reason: e.reason,
        blockedBy: e.blockedBy,
        until: e.until,
        label: e.label,
      };
    }
    return out;
  }

  function hydrate(raw) {
    const mgr = { runways: {} };
    if (!raw) return create();
    for (const [id, e] of Object.entries(raw)) {
      mgr.runways[id] = {
        state: e.state || 'free',
        reason: e.reason || null,
        blockedBy: e.blockedBy || null,
        until: e.until || 0,
        label: e.label || LABELS[e.state] || LABELS.free,
      };
    }
    // completa pistas faltantes do aeroporto atual
    if (DATA.RUNWAYS) {
      for (const id of Object.keys(DATA.RUNWAYS)) {
        if (!mgr.runways[id]) mgr.runways[id] = emptyEntry();
      }
    }
    return mgr;
  }

  return {
    STATES,
    LABELS,
    BLOCK_REASONS,
    create,
    get,
    setState,
    block,
    startInspection,
    markCleared,
    release,
    isUnavailable,
    reasonLabel,
    syncOccupied,
    update,
    serialize,
    hydrate,
  };
})();

if (typeof module !== 'undefined') module.exports = { RunwayState };
