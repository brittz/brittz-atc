// ============================================================
// Sistema de Emergências 2.0 — perfis, fluxo e helpers
// Arquitetura compartilhada entre browser e Node/CommonJS.
// ============================================================
'use strict';

if (typeof DATA === 'undefined' && typeof require !== 'undefined') {
  const _d = require('./data.js');
  globalThis.DATA = _d.DATA;
  globalThis.U = _d.U;
}

const Emergency = (() => {
  const STAGES = [
    'declared', 'identified', 'assessed', 'coordinating',
    'vectoring', 'approach', 'landing', 'post-landing', 'closed',
  ];

  const STAGE_LABELS = {
    declared: 'Declaração',
    identified: 'Identificação',
    assessed: 'Avaliação',
    coordinating: 'Coordenação',
    vectoring: 'Vetoração',
    approach: 'Aproximação',
    landing: 'Pouso',
    'post-landing': 'Pós-pouso',
    closed: 'Encerramento',
  };

  const QUICK_ACTIONS = [
    { label: 'Natureza', cmd: 'NATURE', cls: 'emg' },
    { label: 'Pessoas a bordo', cmd: 'SOULS', cls: 'emg' },
    { label: 'Combustível', cmd: 'FUEL', cls: 'emg' },
    { label: 'Intenções', cmd: 'INTENTIONS', cls: 'emg' },
    { label: 'Pista preferida', cmd: 'RWY', cls: 'emg' },
    { label: 'Situação atual', cmd: 'STATUS', cls: 'emg' },
  ];

  const PEOPLE_BY_TYPE = {
    A320: [120, 180], A20N: [120, 180], A21N: [135, 205], B738: [130, 185],
    E195: [85, 125], AT76: [45, 70], B77W: [240, 360], B789: [220, 320],
    H125: [2, 6], R44: [2, 4], AW39: [4, 12],
  };

  const TYPES = {
    'bird-strike': {
      title: 'Bird strike',
      nature: 'bird strike',
      declaration: 'PAN PAN',
      severity: 'medium',
      effects: { climbFactor: 0.9 },
      reviewEvery: [55, 85],
      worsenChance: 0.35,
      worsenTo: 'engine-failure',
      improveChance: 0.08,
    },
    'engine-failure': {
      title: 'Falha de motor',
      nature: 'engine failure',
      declaration: 'MAYDAY',
      severity: 'high',
      effects: { climbFactor: 0.58, maxAlt: 14000, preferredSpeedMax: 250 },
      reviewEvery: [60, 95],
      worsenChance: 0.18,
      improveChance: 0.06,
    },
    'engine-fire': {
      title: 'Incêndio em motor',
      nature: 'engine fire',
      declaration: 'MAYDAY',
      severity: 'critical',
      effects: { climbFactor: 0.52, maxAlt: 11000, preferredSpeedMax: 230 },
      reviewEvery: [40, 70],
      worsenChance: 0.22,
      improveChance: 0.04,
    },
    'hydraulic-failure': {
      title: 'Falha hidráulica',
      nature: 'hydraulic failure',
      declaration: 'PAN PAN',
      severity: 'high',
      effects: { turnRateFactor: 0.62, responseDelayFactor: 1.15, preferredSpeedMinAdd: 10 },
      reviewEvery: [65, 100],
      worsenChance: 0.12,
      improveChance: 0.1,
    },
    'electrical-failure': {
      title: 'Falha elétrica',
      nature: 'electrical failure',
      declaration: 'PAN PAN',
      severity: 'medium',
      effects: { responseDelayFactor: 1.1 },
      reviewEvery: [70, 110],
      worsenChance: 0.1,
      improveChance: 0.08,
    },
    'landing-gear': {
      title: 'Problema no trem de pouso',
      nature: 'landing gear issue',
      declaration: 'PAN PAN',
      severity: 'high',
      effects: { preferLongRunway: true, approachSpeedAdd: 18, preferredSpeedMinAdd: 12 },
      reviewEvery: [65, 95],
      worsenChance: 0.08,
      improveChance: 0.04,
    },
    'flap-failure': {
      title: 'Falha de flaps',
      nature: 'flap failure',
      declaration: 'PAN PAN',
      severity: 'medium',
      effects: { approachSpeedAdd: 22, preferredSpeedMinAdd: 15 },
      reviewEvery: [65, 95],
      worsenChance: 0.08,
      improveChance: 0.05,
    },
    depressurization: {
      title: 'Despressurização',
      nature: 'depressurization',
      declaration: 'MAYDAY',
      severity: 'high',
      effects: { maxAlt: 11000 },
      reviewEvery: [50, 75],
      worsenChance: 0.12,
      improveChance: 0.05,
    },
    medical: {
      title: 'Emergência médica',
      nature: 'medical emergency',
      declaration: 'PAN PAN',
      severity: 'medium',
      effects: {},
      reviewEvery: [75, 115],
      worsenChance: 0.08,
      improveChance: 0.05,
    },
    'low-fuel': {
      title: 'Pouco combustível',
      nature: 'minimum fuel',
      declaration: 'PAN PAN',
      severity: 'medium',
      effects: {},
      reviewEvery: [45, 70],
      worsenChance: 0.32,
      worsenSeverity: 'critical',
      improveChance: 0,
    },
    'cabin-smoke': {
      title: 'Fumaça na cabine',
      nature: 'smoke in cabin',
      declaration: 'PAN PAN',
      severity: 'high',
      effects: { preferredSpeedMax: 240 },
      reviewEvery: [45, 70],
      worsenChance: 0.2,
      improveChance: 0.18,
    },
    'cockpit-smoke': {
      title: 'Fumaça no cockpit',
      nature: 'smoke in cockpit',
      declaration: 'MAYDAY',
      severity: 'critical',
      effects: { preferredSpeedMax: 220, responseDelayFactor: 1.2 },
      reviewEvery: [40, 65],
      worsenChance: 0.18,
      improveChance: 0.08,
    },
    'bomb-threat': {
      title: 'Ameaça de bomba',
      nature: 'bomb threat',
      declaration: 'PAN PAN',
      severity: 'high',
      effects: { preferLongRunway: true },
      reviewEvery: [70, 110],
      worsenChance: 0.04,
      improveChance: 0,
    },
    windshear: {
      title: 'Windshear',
      nature: 'windshear encounter',
      declaration: 'MAYDAY',
      severity: 'high',
      effects: { preferredSpeedMinAdd: 10, preferredSpeedMax: 220 },
      reviewEvery: [35, 60],
      worsenChance: 0.12,
      improveChance: 0.18,
    },
    hail: {
      title: 'Granizo',
      nature: 'hail encounter',
      declaration: 'PAN PAN',
      severity: 'medium',
      effects: { preferredSpeedMax: 240 },
      reviewEvery: [55, 85],
      worsenChance: 0.1,
      improveChance: 0.12,
    },
    'severe-turbulence': {
      title: 'Turbulência severa',
      nature: 'severe turbulence',
      declaration: 'PAN PAN',
      severity: 'medium',
      effects: { turnRateFactor: 0.75, preferredSpeedMax: 240 },
      reviewEvery: [50, 80],
      worsenChance: 0.12,
      improveChance: 0.12,
    },
  };

  function rankSeverity(s) {
    const v = { low: 0, medium: 1, high: 2, critical: 3 }[s];
    return v == null ? 1 : v;
  }

  function clampSeverity(rank) {
    return ['low', 'medium', 'high', 'critical'][Math.max(0, Math.min(3, rank))];
  }

  function shiftSeverity(sev, delta) {
    return clampSeverity(rankSeverity(sev) + delta);
  }

  function getProfile(kind) {
    return TYPES[kind] || TYPES['engine-failure'];
  }

  function estimateSouls(type) {
    const range = PEOPLE_BY_TYPE[type] || [4, 12];
    return Math.round(U.rnd(range[0], range[1]));
  }

  function fuelMinutes(kind, severity, ac) {
    if (kind === 'low-fuel') return rankSeverity(severity) >= 3 ? Math.round(U.rnd(8, 14)) : Math.round(U.rnd(16, 28));
    if (ac.kind === 'dep') return Math.round(U.rnd(35, 75));
    return Math.round(U.rnd(25, 60));
  }

  function fmtFuel(min) {
    if (min <= 15) return 'fuel critical, endurance ' + min + ' minutes';
    return 'fuel remaining ' + min + ' minutes';
  }

  function preferredRunway(game, ac, effects) {
    const cfg = DATA.CONFIGS[game ? game.cfg : (DATA.AIRPORT.defaultCfg || Object.keys(DATA.CONFIGS)[0])];
    const current = ac.kind === 'dep' ? (cfg ? cfg.depRwy : ac.rwy) : (cfg ? cfg.arrRwy : ac.rwy);
    if (!effects.preferLongRunway) return current || ac.rwy || null;
    let best = current || ac.rwy || null;
    let bestLen = best && DATA.RUNWAYS[best] ? DATA.RUNWAYS[best].len : 0;
    for (const [rid, rw] of Object.entries(DATA.RUNWAYS)) {
      if (rw.len > bestLen) { best = rid; bestLen = rw.len; }
    }
    return best;
  }

  function buildIntentions(ac, nature, runway) {
    if (ac.kind === 'dep') {
      if (nature === 'engine fire' || nature === 'engine failure') return 'request immediate return for landing';
      return 'request vectors to return and land as soon as possible';
    }
    return 'request priority approach and landing' + (runway ? ' runway ' + runway : '');
  }

  function effectScale(sev) {
    return [1, 0.96, 0.9, 0.82][rankSeverity(sev)];
  }

  function applySeverityToEffects(effects, sev) {
    const scale = effectScale(sev);
    const out = { ...effects };
    if (out.climbFactor != null) out.climbFactor *= scale;
    if (out.turnRateFactor != null) out.turnRateFactor *= 0.92 + (scale - 0.82);
    if (out.maxAlt != null) out.maxAlt = Math.max(4000, Math.round(out.maxAlt - rankSeverity(sev) * 1000));
    if (out.approachSpeedAdd != null) out.approachSpeedAdd += rankSeverity(sev) * 3;
    if (out.preferredSpeedMinAdd != null) out.preferredSpeedMinAdd += rankSeverity(sev) * 2;
    if (out.preferredSpeedMax != null) out.preferredSpeedMax = Math.max(160, out.preferredSpeedMax - rankSeverity(sev) * 5);
    return out;
  }

  function mkInfo(ac, game, kind, severity, effects) {
    const profile = getProfile(kind);
    const runway = preferredRunway(game, ac, effects);
    return {
      souls: estimateSouls(ac.type),
      fuelMin: fuelMinutes(kind, severity, ac),
      runway,
      nature: profile.nature,
      intentions: buildIntentions(ac, profile.nature, runway),
    };
  }

  function summaryText(emg) {
    if (!emg || !emg.active) return 'sem emergência ativa';
    return emg.title + ' · ' + labelSeverity(emg.severity) + ' · ' + labelStage(emg.stage);
  }

  function create(kind, ac, game, opts) {
    opts = opts || {};
    const profile = getProfile(kind);
    const severity = opts.severity || profile.severity || 'medium';
    const effects = applySeverityToEffects(profile.effects || {}, severity);
    const baseTime = game ? game.time : 0;
    const info = mkInfo(ac, game, kind, severity, effects);
    return {
      active: true,
      kind,
      title: profile.title,
      declaration: opts.declaration || profile.declaration || (rankSeverity(severity) >= 2 ? 'MAYDAY' : 'PAN PAN'),
      severity,
      stage: opts.stage || 'declared',
      evolution: 'stable',
      startedAt: baseTime,
      stageAt: baseTime,
      nextReviewAt: baseTime + U.rnd((profile.reviewEvery || [50, 80])[0], (profile.reviewEvery || [50, 80])[1]),
      nextInitiativeAt: baseTime + U.rnd(35, 60),
      answers: { nature: false, souls: false, fuel: false, intentions: false, runway: false, status: false },
      info,
      effects,
      flags: { coordinated: false, recovered: false },
      outcome: null,
      resultNote: '',
    };
  }

  function hydrate(raw) {
    if (!raw) return null;
    if (raw === true) return create('engine-failure', { type: 'A320', kind: 'arr' }, null, {});
    if (raw.active === false && !raw.kind) return null;
    const profile = getProfile(raw.kind || 'engine-failure');
    const severity = raw.severity || profile.severity || 'medium';
    const effects = raw.effects || applySeverityToEffects(profile.effects || {}, severity);
    return {
      active: raw.active !== false,
      kind: raw.kind || 'engine-failure',
      title: raw.title || profile.title,
      declaration: raw.declaration || profile.declaration || 'PAN PAN',
      severity,
      stage: raw.stage || 'declared',
      evolution: raw.evolution || 'stable',
      startedAt: raw.startedAt || 0,
      stageAt: raw.stageAt || raw.startedAt || 0,
      nextReviewAt: raw.nextReviewAt || 0,
      nextInitiativeAt: raw.nextInitiativeAt || 0,
      answers: { nature: false, souls: false, fuel: false, intentions: false, runway: false, status: false, ...(raw.answers || {}) },
      info: {
        souls: raw.info && raw.info.souls != null ? raw.info.souls : estimateSouls('A320'),
        fuelMin: raw.info && raw.info.fuelMin != null ? raw.info.fuelMin : 30,
        runway: raw.info ? raw.info.runway : null,
        nature: raw.info && raw.info.nature ? raw.info.nature : profile.nature,
        intentions: raw.info && raw.info.intentions ? raw.info.intentions : 'request priority landing',
      },
      effects,
      flags: { coordinated: false, recovered: false, ...((raw.flags) || {}) },
      outcome: raw.outcome || null,
      resultNote: raw.resultNote || '',
    };
  }

  function serialize(emg) {
    if (!emg) return null;
    return {
      active: emg.active,
      kind: emg.kind,
      title: emg.title,
      declaration: emg.declaration,
      severity: emg.severity,
      stage: emg.stage,
      evolution: emg.evolution,
      answers: { ...emg.answers },
      info: {
        souls: emg.info.souls,
        fuelMin: emg.info.fuelMin,
        runway: emg.info.runway,
        nature: emg.info.nature,
        intentions: emg.info.intentions,
      },
      outcome: emg.outcome,
      resultNote: emg.resultNote,
    };
  }

  function labelStage(stage) {
    return STAGE_LABELS[stage] || stage;
  }

  function labelSeverity(sev) {
    return { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' }[sev] || sev;
  }

  function labelAirportState(st) {
    return { normal: 'Normal', emergency: 'Emergência', recovery: 'Recuperação' }[st] || st;
  }

  function declareText(ac) {
    const e = hydrate(ac.emergency);
    if (!e) return '';
    return `${e.declaration} ${e.declaration} ${e.declaration}, ${e.info.nature}, ${e.info.intentions}`;
  }

  function statusText(e) {
    if (e.outcome) return `${e.title}, ${e.outcome}`;
    if (e.evolution === 'worsening') return `${e.title}, situation worsening`;
    if (e.evolution === 'improving') return `${e.title}, condition improving`;
    return `${e.title}, currently stable`;
  }

  function normalizeQuery(q) {
    const map = {
      NATURE: 'nature', NATUREZA: 'nature', NAT: 'nature',
      SOULS: 'souls', POB: 'souls',
      FUEL: 'fuel', COMB: 'fuel', COMBUSTIVEL: 'fuel',
      INTENTIONS: 'intentions', INTENCOES: 'intentions', INTENÇÕES: 'intentions', INTENT: 'intentions',
      RWY: 'runway', RUNWAY: 'runway', PISTA: 'runway',
      STATUS: 'status', EMERG: 'status', EMERGENCIA: 'status', EMERGÊNCIA: 'status',
    };
    return map[String(q || '').toUpperCase()] || null;
  }

  function atcPrompt(query) {
    return {
      nature: 'say nature of emergency',
      souls: 'souls on board',
      fuel: 'fuel remaining',
      intentions: 'say intentions',
      runway: 'preferred runway',
      status: 'say present status',
    }[query] || 'say again';
  }

  function answer(ac, queryToken) {
    const q = normalizeQuery(queryToken);
    if (!q) return { err: 'consulta de emergência inválida' };
    const e = hydrate(ac.emergency);
    if (!e || !e.active) return { err: 'negativo, não declaramos emergência' };
    ac.emergency = e;
    e.answers[q] = true;
    let rb = '';
    if (q === 'nature') rb = e.info.nature;
    else if (q === 'souls') rb = 'souls on board ' + e.info.souls;
    else if (q === 'fuel') rb = fmtFuel(e.info.fuelMin);
    else if (q === 'intentions') rb = e.info.intentions;
    else if (q === 'runway') rb = e.info.runway ? 'prefer runway ' + e.info.runway : 'no runway preference';
    else rb = statusText(e);
    return { rb };
  }

  function syncStage(ac, game) {
    const e = hydrate(ac.emergency);
    if (!e || !e.active) return null;
    const prev = e.stage;
    let next = prev;
    if (e.outcome) next = 'closed';
    else if (ac.state === 'rollout') next = 'post-landing';
    else if (ac.landClr || ac.state === 'rollout') next = 'landing';
    else if (ac.app && ac.app.phase !== 'none') next = 'approach';
    else if (ac.nav && (ac.nav.mode === 'hdg' || ac.nav.mode === 'hold')) next = 'vectoring';
    else if (e.answers.intentions) next = 'coordinating';
    else if (e.answers.souls && e.answers.fuel) next = 'assessed';
    else if (e.answers.nature) next = 'identified';
    else next = 'declared';
    if (next !== prev) {
      e.stage = next;
      e.stageAt = game ? game.time : e.stageAt;
    }
    ac.emergency = e;
    return next !== prev ? { from: prev, to: next } : null;
  }

  function promoteKind(e, kind, ac, game) {
    const next = create(kind, ac, game, {
      severity: e.severity,
      declaration: getProfile(kind).declaration || e.declaration,
    });
    next.answers = { ...e.answers };
    next.stage = e.stage;
    next.stageAt = game ? game.time : e.stageAt;
    return next;
  }

  function progressReport(e) {
    if (e.evolution === 'worsening') return 'emergency worsening, request priority handling';
    if (e.evolution === 'improving') return 'situation improving, continuing approach';
    return 'emergency continuing, no significant change';
  }

  function validateApproach(ac, rwy) {
    const e = hydrate(ac.emergency);
    if (!e || !e.active || !rwy) return null;
    if (e.effects && e.effects.preferLongRunway && e.info.runway && e.info.runway !== rwy) {
      const pref = DATA.RUNWAYS[e.info.runway];
      const got = DATA.RUNWAYS[rwy];
      if (pref && got && pref.len > got.len) {
        return 'unable pista ' + rwy + ', solicitamos ' + e.info.runway;
      }
    }
    return null;
  }

  function maybeEvolve(ac, game) {
    const e = hydrate(ac.emergency);
    if (!e || !e.active || !game || game.time < e.nextReviewAt) return null;
    const profile = getProfile(e.kind);
    e.nextReviewAt = game.time + U.rnd((profile.reviewEvery || [50, 80])[0], (profile.reviewEvery || [50, 80])[1]);
    const sevRank = rankSeverity(e.severity);
    const improveRoll = Math.random();
    const worsenRoll = Math.random();
    let changed = false;

    if ((profile.improveChance || 0) > 0 && improveRoll < profile.improveChance) {
      e.evolution = 'improving';
      if (sevRank > 0) e.severity = shiftSeverity(e.severity, -1);
      if (e.kind === 'cabin-smoke' && e.severity === 'low') e.resultNote = 'smoke dissipating';
      changed = true;
    } else if ((profile.worsenChance || 0) > 0 && worsenRoll < profile.worsenChance + sevRank * 0.04) {
      e.evolution = 'worsening';
      if (profile.worsenTo) {
        ac.emergency = promoteKind(e, profile.worsenTo, ac, game);
        return { changed: true, text: progressReport(ac.emergency) };
      }
      e.severity = profile.worsenSeverity || shiftSeverity(e.severity, +1);
      changed = true;
    } else {
      e.evolution = 'stable';
    }

    if (e.info && e.info.fuelMin != null) e.info.fuelMin = Math.max(5, e.info.fuelMin - Math.round(U.rnd(2, 6)));
    e.effects = applySeverityToEffects(getProfile(e.kind).effects || {}, e.severity);
    if (e.kind === 'low-fuel' && rankSeverity(e.severity) >= 3) e.info.nature = 'fuel critical';
    ac.emergency = e;
    return { changed, text: progressReport(e) };
  }

  function initiative(ac) {
    const e = hydrate(ac.emergency);
    if (!e || !e.active) return null;
    if (e.stage === 'declared' && !e.answers.nature) return `${e.declaration}, repeating, ${e.info.nature}`;
    if (e.stage === 'identified' && !e.answers.intentions) return 'request priority vectors';
    if (e.stage === 'vectoring' && e.info.runway) return 'request direct approach runway ' + e.info.runway;
    if (e.stage === 'approach' && e.evolution === 'worsening') return 'unable delay, continuing for landing';
    return null;
  }

  function perf(base, emg) {
    const e = hydrate(emg);
    if (!e || !e.active) return { ...base };
    const out = { ...base };
    const fx = e.effects || {};
    if (fx.climbFactor != null) out.climb = Math.max(600, Math.round(out.climb * fx.climbFactor));
    if (fx.preferredSpeedMax != null) out.max = Math.min(out.max, fx.preferredSpeedMax);
    if (fx.approachSpeedAdd != null) out.app += fx.approachSpeedAdd;
    if (fx.preferredSpeedMinAdd != null) out.min += fx.preferredSpeedMinAdd;
    out.turnRate = (out.turnRate || 3) * (fx.turnRateFactor || 1);
    out.maxAlt = fx.maxAlt != null ? fx.maxAlt : 24000;
    out.responseDelayFactor = fx.responseDelayFactor || 1;
    return out;
  }

  function validateAltitude(ac, alt) {
    const e = hydrate(ac.emergency);
    if (!e || !e.active) return null;
    const p = perf(ac.perf, e);
    if (alt > p.maxAlt) return 'unable, com a emergência nossa máxima segura é ' + U.fmtAlt(p.maxAlt);
    return null;
  }

  function validateHeading(ac, hdg) {
    const e = hydrate(ac.emergency);
    if (!e || !e.active) return null;
    const p = perf(ac.perf, e);
    const diff = Math.abs(U.adiff(ac.hdg, hdg));
    if (p.turnRate < 2.1 && ac.spd > 210 && diff > 120)
      return 'unable curva tão fechada, solicitamos vetores mais amplos';
    return null;
  }

  function operationalState(game) {
    if (!game || !game.aircraft) return { state: 'normal', active: [], label: labelAirportState('normal') };
    const active = game.aircraft.filter(a => a.emergency && a.emergency.active && a.state !== 'done');
    if (active.length) {
      const lead = active[0];
      return {
        state: 'emergency',
        active: active.map(a => a.cs),
        emergencyCs: lead.cs,
        label: labelAirportState('emergency'),
        summary: summaryText(lead.emergency),
      };
    }
    if (game.recoveryUntil && game.time < game.recoveryUntil) {
      return { state: 'recovery', active: [], label: labelAirportState('recovery') };
    }
    return { state: 'normal', active: [], label: labelAirportState('normal') };
  }

  return {
    STAGES,
    STAGE_LABELS,
    QUICK_ACTIONS,
    TYPES,
    create,
    hydrate,
    serialize,
    getProfile,
    labelStage,
    labelSeverity,
    labelAirportState,
    atcPrompt,
    answer,
    declareText,
    syncStage,
    maybeEvolve,
    initiative,
    perf,
    validateAltitude,
    validateHeading,
    validateApproach,
    operationalState,
    normalizeQuery,
    summaryText,
  };
})();

if (typeof module !== 'undefined') module.exports = { Emergency };
