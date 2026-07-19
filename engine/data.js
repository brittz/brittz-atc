// ============================================================
// ATC Costa Verde — dados globais e carregador de aeroportos
// O espaço aéreo (fixos, pistas, STARs, SIDs) vive em airports/*.json.
// Coordenadas em milhas náuticas. Origem = centro do aeroporto.
// +x = leste, +y = norte. Proas em graus (0 = norte, horário).
// ============================================================
'use strict';

const DATA = {
  // ---------- Tipos de aeronave (frota global) ----------
  // climb/desc em ft/min, accel em kt/s, velocidades em kt IAS
  TYPES: {
    A320: { climb: 2300, desc: 2000, accel: 1.4, vr: 140, app: 137, min: 125, max: 340, wtc: 'M' },
    A20N: { climb: 2400, desc: 2000, accel: 1.4, vr: 138, app: 136, min: 125, max: 340, wtc: 'M' },
    B738: { climb: 2300, desc: 2100, accel: 1.4, vr: 145, app: 141, min: 130, max: 340, wtc: 'M' },
    A21N: { climb: 2100, desc: 1900, accel: 1.3, vr: 145, app: 140, min: 130, max: 340, wtc: 'M' },
    E195: { climb: 2200, desc: 2000, accel: 1.5, vr: 135, app: 130, min: 120, max: 320, wtc: 'M' },
    AT76: { climb: 1350, desc: 1500, accel: 1.1, vr: 115, app: 113, min: 105, max: 270, wtc: 'M' },
    B77W: { climb: 1900, desc: 1800, accel: 1.2, vr: 155, app: 145, min: 135, max: 350, wtc: 'H' },
    B789: { climb: 2000, desc: 1900, accel: 1.2, vr: 150, app: 142, min: 132, max: 350, wtc: 'H' },
    // helicópteros (VFR, podem pairar)
    H125: { climb: 1200, desc: 1000, accel: 2.0, vr: 0, app: 60, min: 0, max: 130, wtc: 'L', heli: true },
    R44:  { climb:  900, desc:  800, accel: 1.8, vr: 0, app: 55, min: 0, max: 110, wtc: 'L', heli: true },
    AW39: { climb: 1500, desc: 1200, accel: 2.2, vr: 0, app: 70, min: 0, max: 150, wtc: 'L', heli: true },
  },

  // Pool de spawn: preenchido por AirlineService.applyToData() a partir de
  // data/airlines.json (não cadastrar companhias aqui). Um aeroporto pode
  // substituir via campo "airlines" no seu JSON.
  AIRLINES: [],

  // ---------- espaço aéreo ativo (preenchido por setAirport) ----------
  // ORIGINS: cidades/aeroportos de procedência por fixo de entrada de STAR
  // (simétrico a DESTS, que é por fixo de saída de SID). Opcional no JSON.
  FIXES: {}, RUNWAYS: {}, RWY_PAIR: {}, STARS: {}, SIDS: {}, DESTS: {}, ORIGINS: {},
  CONFIGS: {}, SEPARATION: null,
  AIRPORT: { icao: '----', name: '', elev: 0, range: 60, gsSlopeFtNm: 318 },

  setAirport(j) {
    this.FIXES = j.fixes;
    this.RUNWAYS = j.runways;
    this.RWY_PAIR = j.rwyPair;
    this.STARS = j.stars;
    this.SIDS = j.sids;
    this.DESTS = j.dests;
    this.ORIGINS = j.origins || {};
    this.CONFIGS = j.configs;
    this.AIRPORT = {
      icao: j.icao, name: j.name, elev: j.elev ?? 0,
      range: j.range ?? 60, gsSlopeFtNm: j.gsSlopeFtNm ?? 318,
      defaultCfg: j.defaultCfg ?? Object.keys(j.configs)[0],
    };
    if (j.airlines) this.AIRLINES = j.airlines;
    const sepNorm = (typeof Separation !== 'undefined' && Separation.normalize)
      ? Separation.normalize(j.separation)
      : Object.assign({ radarNm: 3, radarFt: 1000, predictNm: 3.2, parallelOps: [] }, j.separation || {});
    this.SEPARATION = sepNorm;
  },

  async loadAirport(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('Falha ao carregar ' + url + ' (' + r.status + ')');
    const j = await r.json();
    this.setAirport(j);
    return j;
  },

  async loadManifest() {
    const r = await fetch('airports/index.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('Falha ao carregar airports/index.json');
    return r.json();
  },
};

// ---------- utilidades geométricas ----------
const U = {
  d2r: d => d * Math.PI / 180,
  r2d: r => r * 180 / Math.PI,
  norm360: a => ((a % 360) + 360) % 360,
  // diferença angular assinada (-180..180): quanto girar de a até b
  adiff: (a, b) => ((b - a + 540) % 360) - 180,
  dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  // proa de (x1,y1) para (x2,y2)
  brg: (x1, y1, x2, y2) => U.norm360(U.r2d(Math.atan2(x2 - x1, y2 - y1))),
  fix: name => DATA.FIXES[name],
  fmtAlt: a => a >= 10000 ? 'FL' + Math.round(a / 100) : Math.round(a).toLocaleString('pt-BR') + ' pés',
  fmtHdg: h => String(Math.round(U.norm360(h)) === 0 ? 360 : Math.round(U.norm360(h))).padStart(3, '0'),
  rnd: (a, b) => a + Math.random() * (b - a),
  pick: arr => arr[Math.floor(Math.random() * arr.length)],
  pickW: arr => { // sorteio ponderado por .w
    const tot = arr.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * tot;
    for (const e of arr) { r -= e.w; if (r <= 0) return e; }
    return arr[arr.length - 1];
  },
};

// Compatibilidade dual browser/Node: no browser DATA/U continuam globais;
// em Node ficam disponíveis via require('./data.js').
if (typeof module !== 'undefined') module.exports = { DATA, U };
