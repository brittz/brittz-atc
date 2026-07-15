// ============================================================
// ATC Costa Verde — dados do espaço aéreo (SBCV fictício)
// Coordenadas em milhas náuticas. Origem = centro do aeroporto.
// +x = leste, +y = norte. Proas em graus (0 = norte, horário).
// ============================================================
'use strict';

const DATA = (() => {

  // ---------- Fixos ----------
  const FIXES = {
    // Entradas da TMA (cantos)
    SABIA: [-40, 42], COSTA: [-42, -38], PEDRA: [42, 40], TRIGO: [44, -36],
    // Terminal oeste (fluxo 09)
    TUCAN: [-36, 26], PREMA: [-29, 13], NIDOL: [-23, 5], GOMES: [-13, 0],
    MANGA: [-35, -24], PALMA: [-28, -11], SOLAR: [-22, -4],
    // Perna do vento norte/sul (entradas leste no fluxo 09)
    LAGOA: [18, 27], VERDE: [-4, 21], NORTE: [-18, 14],
    BREJO: [16, -25], CAJUZ: [-6, -19], SULFI: [-19, -12],
    // Terminal leste (fluxo 27)
    TIGRE: [36, 25], ROCHA: [29, 12], DUNAS: [23, 5], FAROL: [13, 0],
    SERRA: [35, -23], PRAIA: [28, -10], CORAL: [22, -4],
    LENCO: [-18, 27], VINHA: [4, 21], NOBRE: [18, 14],
    CINZA: [-16, -25], TOLDO: [6, -19], BURIT: [19, -12],
    // SIDs
    VOLTA: [9, 6], MORRO: [6, 24], ARENA: [2, 52],
    RUMOS: [12, 3], BALSA: [46, 26],
    TRILA: [12, -4], CACTO: [46, -24],
    SERTA: [8, -8], VALES: [-2, -26], DENDE: [-10, -50],
    GIRAR: [-9, 6], SINOS: [-6, 24], PONTE: [-11, -4], VARZE: [-4, -22],
  };

  // ---------- Pistas ----------
  // thr = cabeceira; hdg = rumo de pouso/decolagem; len em NM
  const RUNWAYS = {
    '09L': { thr: [-0.95,  0.4], hdg:  90, len: 1.9, opp: '27R' },
    '27R': { thr: [ 0.95,  0.4], hdg: 270, len: 1.9, opp: '09L' },
    '09R': { thr: [-0.95, -0.4], hdg:  90, len: 1.9, opp: '27L' },
    '27L': { thr: [ 0.95, -0.4], hdg: 270, len: 1.9, opp: '09R' },
  };
  // pares físicos (ocupação vale para os dois sentidos)
  const RWY_PAIR = { '09L':'N', '27R':'N', '09R':'S', '27L':'S' };

  // ---------- STARs ----------
  // route: [{fix, alt, spd}] — restrições "cruzar a" (usadas no "descer via")
  const STARS = {
    // ----- fluxo 09 (aproximação pelo oeste) -----
    SABIA1: { cfg:'09', entry:'SABIA', name:'SABIA 1 (chegada NW)', route: [
      { fix:'SABIA', alt:16000, spd:290 },
      { fix:'TUCAN', alt:12000, spd:280 },
      { fix:'PREMA', alt: 9000, spd:250 },
      { fix:'NIDOL', alt: 6000, spd:220 },
      { fix:'GOMES', alt: 4000, spd:200 },
    ]},
    COSTA1: { cfg:'09', entry:'COSTA', name:'COSTA 1 (chegada SW)', route: [
      { fix:'COSTA', alt:16000, spd:290 },
      { fix:'MANGA', alt:12000, spd:280 },
      { fix:'PALMA', alt: 9000, spd:250 },
      { fix:'SOLAR', alt: 6000, spd:220 },
      { fix:'GOMES', alt: 4000, spd:200 },
    ]},
    PEDRA1: { cfg:'09', entry:'PEDRA', name:'PEDRA 1 (chegada NE)', route: [
      { fix:'PEDRA', alt:16000, spd:290 },
      { fix:'LAGOA', alt:14000, spd:280 },
      { fix:'VERDE', alt:11000, spd:250 },
      { fix:'NORTE', alt: 8000, spd:220 },
      { fix:'NIDOL', alt: 6000, spd:200 },
      { fix:'GOMES', alt: 4000, spd:180 },
    ]},
    TRIGO1: { cfg:'09', entry:'TRIGO', name:'TRIGO 1 (chegada SE)', route: [
      { fix:'TRIGO', alt:16000, spd:290 },
      { fix:'BREJO', alt:14000, spd:280 },
      { fix:'CAJUZ', alt:11000, spd:250 },
      { fix:'SULFI', alt: 8000, spd:220 },
      { fix:'SOLAR', alt: 6000, spd:200 },
      { fix:'GOMES', alt: 4000, spd:180 },
    ]},
    // ----- fluxo 27 (aproximação pelo leste) -----
    PEDRA2: { cfg:'27', entry:'PEDRA', name:'PEDRA 2 (chegada NE)', route: [
      { fix:'PEDRA', alt:16000, spd:290 },
      { fix:'TIGRE', alt:12000, spd:280 },
      { fix:'ROCHA', alt: 9000, spd:250 },
      { fix:'DUNAS', alt: 6000, spd:220 },
      { fix:'FAROL', alt: 4000, spd:200 },
    ]},
    TRIGO2: { cfg:'27', entry:'TRIGO', name:'TRIGO 2 (chegada SE)', route: [
      { fix:'TRIGO', alt:16000, spd:290 },
      { fix:'SERRA', alt:12000, spd:280 },
      { fix:'PRAIA', alt: 9000, spd:250 },
      { fix:'CORAL', alt: 6000, spd:220 },
      { fix:'FAROL', alt: 4000, spd:200 },
    ]},
    SABIA2: { cfg:'27', entry:'SABIA', name:'SABIA 2 (chegada NW)', route: [
      { fix:'SABIA', alt:16000, spd:290 },
      { fix:'LENCO', alt:14000, spd:280 },
      { fix:'VINHA', alt:11000, spd:250 },
      { fix:'NOBRE', alt: 8000, spd:220 },
      { fix:'DUNAS', alt: 6000, spd:200 },
      { fix:'FAROL', alt: 4000, spd:180 },
    ]},
    COSTA2: { cfg:'27', entry:'COSTA', name:'COSTA 2 (chegada SW)', route: [
      { fix:'COSTA', alt:16000, spd:290 },
      { fix:'CINZA', alt:14000, spd:280 },
      { fix:'TOLDO', alt:11000, spd:250 },
      { fix:'BURIT', alt: 8000, spd:220 },
      { fix:'CORAL', alt: 6000, spd:200 },
      { fix:'FAROL', alt: 4000, spd:180 },
    ]},
  };

  // ---------- SIDs ----------
  // subida inicial: proa da pista até 900 ft AGL, depois navega pelos fixos.
  // teto inicial 5000 ft — o controlador libera a subida.
  const SIDS = {
    ARENA1: { cfg:'09', exit:'ARENA', name:'ARENA 1 (saída N)',  route:['VOLTA','MORRO','ARENA'] },
    BALSA1: { cfg:'09', exit:'BALSA', name:'BALSA 1 (saída NE)', route:['RUMOS','BALSA'] },
    CACTO1: { cfg:'09', exit:'CACTO', name:'CACTO 1 (saída SE)', route:['TRILA','CACTO'] },
    DENDE1: { cfg:'09', exit:'DENDE', name:'DENDE 1 (saída SW)', route:['SERTA','VALES','DENDE'] },
    ARENA2: { cfg:'27', exit:'ARENA', name:'ARENA 2 (saída N)',  route:['GIRAR','SINOS','ARENA'] },
    BALSA2: { cfg:'27', exit:'BALSA', name:'BALSA 2 (saída NE)', route:['GIRAR','SINOS','BALSA'] },
    CACTO2: { cfg:'27', exit:'CACTO', name:'CACTO 2 (saída SE)', route:['PONTE','VARZE','CACTO'] },
    DENDE2: { cfg:'27', exit:'DENDE', name:'DENDE 2 (saída SW)', route:['PONTE','VARZE','DENDE'] },
  };

  // destinos ilustrativos por saída (só para as strips)
  const DESTS = {
    ARENA: ['SBFZ','SBRF','TNCA','KMIA'],
    BALSA: ['SBSV','GVAC','LPPT','LEMD'],
    CACTO: ['SBGL','SBGR','SBKP','SBCF'],
    DENDE: ['SBPA','SBFL','SAEZ','SCEL'],
  };

  // ---------- Tipos de aeronave ----------
  // climb/desc em ft/min, accel em kt/s, velocidades em kt IAS
  const TYPES = {
    A320: { climb: 2300, desc: 2000, accel: 1.4, vr: 140, app: 137, min: 125, max: 340, wtc: 'M' },
    A20N: { climb: 2400, desc: 2000, accel: 1.4, vr: 138, app: 136, min: 125, max: 340, wtc: 'M' },
    B738: { climb: 2300, desc: 2100, accel: 1.4, vr: 145, app: 141, min: 130, max: 340, wtc: 'M' },
    A21N: { climb: 2100, desc: 1900, accel: 1.3, vr: 145, app: 140, min: 130, max: 340, wtc: 'M' },
    E195: { climb: 2200, desc: 2000, accel: 1.5, vr: 135, app: 130, min: 120, max: 320, wtc: 'M' },
    AT76: { climb: 1350, desc: 1500, accel: 1.1, vr: 115, app: 113, min: 105, max: 270, wtc: 'M' },
    B77W: { climb: 1900, desc: 1800, accel: 1.2, vr: 155, app: 145, min: 135, max: 350, wtc: 'H' },
    B789: { climb: 2000, desc: 1900, accel: 1.2, vr: 150, app: 142, min: 132, max: 350, wtc: 'H' },
  };

  // companhias: prefixo, nome rádio, tipos que operam, peso p/ sorteio
  const AIRLINES = [
    { code:'TAM', radio:'LATAM',      types:['A320','A21N','A20N','B77W'], w:5 },
    { code:'GLO', radio:'Gol',        types:['B738'],                      w:5 },
    { code:'AZU', radio:'Azul',       types:['E195','A20N','AT76'],        w:5 },
    { code:'PTB', radio:'Passaredo',  types:['AT76'],                      w:1 },
    { code:'TAP', radio:'Air Portugal', types:['A21N','B789'],             w:1 },
    { code:'ARG', radio:'Argentina',  types:['B738'],                      w:1 },
    { code:'AAL', radio:'American',   types:['B77W','B789'],               w:1 },
    { code:'AFR', radio:'Air France', types:['B77W'],                      w:1 },
  ];

  const AIRPORT = {
    icao: 'SBCV',
    name: 'Costa Verde Intl',
    elev: 26,          // ft (desprezível — jogo usa MSL≈AGL)
    range: 60,         // raio da TMA em NM
    gsSlopeFtNm: 318,  // rampa de 3° ≈ 318 ft por NM
  };

  // configurações operacionais
  const CONFIGS = {
    '09': { arrRwy:'09L', depRwy:'09R', wind:{dir:80,  spd:9}, label:'Fluxo LESTE — pousos 09L, decolagens 09R' },
    '27': { arrRwy:'27R', depRwy:'27L', wind:{dir:260, spd:9}, label:'Fluxo OESTE — pousos 27R, decolagens 27L' },
  };

  return { FIXES, RUNWAYS, RWY_PAIR, STARS, SIDS, DESTS, TYPES, AIRLINES, AIRPORT, CONFIGS };
})();

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
