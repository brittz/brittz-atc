// ============================================================
// Emergency Units — veículos de resposta (ARFF, ambulância, etc.)
// Movimento simplificado em NM; registro tipado para extensão.
// ============================================================
'use strict';

if (typeof DATA === 'undefined' && typeof require !== 'undefined') {
  const _d = require('./data.js');
  globalThis.DATA = _d.DATA;
  globalThis.U = _d.U;
}

const EmergencyUnits = (() => {
  // Registro extensível: novos tipos = nova entrada (sem reestruturar).
  const UNIT_TYPES = {
    arff: {
      id: 'arff',
      label: 'Bombeiros (ARFF)',
      short: 'ARFF',
      color: '#ff6b35',
      speed: 0.22, // NM/s
      baseOffset: [-0.35, -1.15],
    },
    ambulance: {
      id: 'ambulance',
      label: 'Ambulância',
      short: 'AMB',
      color: '#4ecdc4',
      speed: 0.18,
      baseOffset: [-0.15, -1.2],
    },
    medical: {
      id: 'medical',
      label: 'Equipe médica',
      short: 'MED',
      color: '#45b7d1',
      speed: 0.16,
      baseOffset: [0.05, -1.18],
    },
    ops: {
      id: 'ops',
      label: 'Veículo de operações',
      short: 'OPS',
      color: '#f7b731',
      speed: 0.15,
      baseOffset: [0.25, -1.22],
    },
    // hooks futuros (não despachados no v1):
    // 'follow-me': { ... },
    // tow: { ... },
  };

  const PHASES = [
    'at_base', 'enroute_staging', 'staging', 'entering',
    'approaching', 'on_scene', 'returning',
  ];

  let _seq = 1;

  function profile(type) {
    return UNIT_TYPES[type] || UNIT_TYPES.ops;
  }

  function basePos(type) {
    const p = profile(type);
    return { x: p.baseOffset[0], y: p.baseOffset[1] };
  }

  function stagingPoint(rwy) {
    const r = DATA.RUNWAYS[rwy];
    if (!r) return { x: 0.4, y: -0.9 };
    const mid = r.len * 0.45;
    const alongX = r.thr[0] + Math.sin(U.d2r(r.hdg)) * mid;
    const alongY = r.thr[1] + Math.cos(U.d2r(r.hdg)) * mid;
    const off = U.d2r(r.hdg + 90);
    return {
      x: alongX + Math.sin(off) * 0.28,
      y: alongY + Math.cos(off) * 0.28,
    };
  }

  function approachPoint(ac, rwy) {
    if (ac && ac.x != null) return { x: ac.x, y: ac.y };
    const r = DATA.RUNWAYS[rwy];
    if (!r) return { x: 0, y: 0 };
    const mid = r.len * 0.5;
    return {
      x: r.thr[0] + Math.sin(U.d2r(r.hdg)) * mid,
      y: r.thr[1] + Math.cos(U.d2r(r.hdg)) * mid,
    };
  }

  function createUnit(type, opts) {
    opts = opts || {};
    const p = profile(type);
    const base = basePos(type);
    return {
      id: opts.id || ('eu' + (_seq++)),
      type: p.id,
      label: p.label,
      short: p.short,
      color: p.color,
      x: base.x,
      y: base.y,
      hdg: 0,
      phase: 'at_base',
      targetRwy: opts.targetRwy || null,
      targetCs: opts.targetCs || null,
      navTarget: null,
      holdUntil: 0,
      onSceneUntil: 0,
      speed: p.speed,
    };
  }

  function headingTo(u, tx, ty) {
    return U.norm360(U.r2d(Math.atan2(tx - u.x, ty - u.y)));
  }

  function moveToward(u, tx, ty, dt) {
    const dx = tx - u.x;
    const dy = ty - u.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.04) {
      u.x = tx; u.y = ty;
      return true;
    }
    u.hdg = headingTo(u, tx, ty);
    const step = Math.min(dist, u.speed * dt);
    u.x += (dx / dist) * step;
    u.y += (dy / dist) * step;
    return dist - step < 0.04;
  }

  function dispatch(unit, rwy, cs) {
    unit.targetRwy = rwy;
    unit.targetCs = cs || null;
    unit.phase = 'enroute_staging';
    const st = stagingPoint(rwy);
    unit.navTarget = { x: st.x, y: st.y, kind: 'staging' };
    return unit;
  }

  function recall(unit) {
    const base = basePos(unit.type);
    unit.phase = 'returning';
    unit.navTarget = { x: base.x, y: base.y, kind: 'base' };
    unit.onSceneUntil = 0;
    return unit;
  }

  function enterRunway(unit) {
    if (unit.phase !== 'staging' && unit.phase !== 'enroute_staging') return unit;
    unit.phase = 'entering';
    const r = DATA.RUNWAYS[unit.targetRwy];
    if (r) {
      const mid = r.len * 0.4;
      unit.navTarget = {
        x: r.thr[0] + Math.sin(U.d2r(r.hdg)) * mid,
        y: r.thr[1] + Math.cos(U.d2r(r.hdg)) * mid,
        kind: 'runway',
      };
    }
    return unit;
  }

  function approachAircraft(unit, ac) {
    unit.phase = 'approaching';
    const pt = approachPoint(ac, unit.targetRwy);
    unit.navTarget = { x: pt.x, y: pt.y, kind: 'aircraft' };
    return unit;
  }

  function updateUnit(unit, game, dt) {
    if (!unit) return;
    if (unit.holdUntil && game.time < unit.holdUntil) return;

    if (unit.phase === 'enroute_staging' && unit.navTarget) {
      if (moveToward(unit, unit.navTarget.x, unit.navTarget.y, dt)) {
        unit.phase = 'staging';
        unit.holdUntil = game.time + 2;
        unit.navTarget = null;
      }
      return;
    }

    if (unit.phase === 'entering' && unit.navTarget) {
      if (moveToward(unit, unit.navTarget.x, unit.navTarget.y, dt)) {
        unit.phase = 'approaching';
        unit.navTarget = null;
      }
      return;
    }

    if (unit.phase === 'approaching') {
      const ac = unit.targetCs && game.aircraft
        ? game.aircraft.find(a => a.cs === unit.targetCs)
        : null;
      const pt = approachPoint(ac, unit.targetRwy);
      if (moveToward(unit, pt.x, pt.y, dt)) {
        unit.phase = 'on_scene';
        unit.onSceneUntil = game.time + U.rnd(18, 28);
        unit.navTarget = null;
      }
      return;
    }

    if (unit.phase === 'on_scene') {
      if (unit.onSceneUntil && game.time >= unit.onSceneUntil) {
        recall(unit);
      }
      return;
    }

    if (unit.phase === 'returning' && unit.navTarget) {
      if (moveToward(unit, unit.navTarget.x, unit.navTarget.y, dt)) {
        unit.phase = 'at_base';
        unit.navTarget = null;
        unit.targetRwy = null;
        unit.targetCs = null;
      }
    }
  }

  function updateAll(units, game, dt) {
    if (!units) return;
    for (const u of units) updateUnit(u, game, dt);
  }

  function allAtBaseOrReturning(units) {
    if (!units || !units.length) return true;
    return units.every(u => u.phase === 'at_base' || u.phase === 'returning');
  }

  function allAtBase(units) {
    if (!units || !units.length) return true;
    return units.every(u => u.phase === 'at_base');
  }

  function anyOnScene(units) {
    return (units || []).some(u => u.phase === 'on_scene' || u.phase === 'approaching');
  }

  function serialize(units) {
    return (units || []).map(u => ({
      id: u.id,
      type: u.type,
      label: u.label,
      short: u.short,
      color: u.color,
      x: u.x,
      y: u.y,
      hdg: u.hdg,
      phase: u.phase,
      targetRwy: u.targetRwy,
      targetCs: u.targetCs,
      holdUntil: u.holdUntil,
      onSceneUntil: u.onSceneUntil,
      speed: u.speed,
      navTarget: u.navTarget ? { ...u.navTarget } : null,
    }));
  }

  function hydrate(list) {
    if (!list || !list.length) return [];
    return list.map(raw => {
      const p = profile(raw.type);
      return {
        id: raw.id || ('eu' + (_seq++)),
        type: p.id,
        label: raw.label || p.label,
        short: raw.short || p.short,
        color: raw.color || p.color,
        x: raw.x != null ? raw.x : p.baseOffset[0],
        y: raw.y != null ? raw.y : p.baseOffset[1],
        hdg: raw.hdg || 0,
        phase: raw.phase || 'at_base',
        targetRwy: raw.targetRwy || null,
        targetCs: raw.targetCs || null,
        navTarget: raw.navTarget || null,
        holdUntil: raw.holdUntil || 0,
        onSceneUntil: raw.onSceneUntil || 0,
        speed: raw.speed != null ? raw.speed : p.speed,
      };
    });
  }

  return {
    UNIT_TYPES,
    PHASES,
    profile,
    createUnit,
    dispatch,
    recall,
    enterRunway,
    approachAircraft,
    updateUnit,
    updateAll,
    allAtBaseOrReturning,
    allAtBase,
    anyOnScene,
    stagingPoint,
    serialize,
    hydrate,
  };
})();

if (typeof module !== 'undefined') module.exports = { EmergencyUnits };
