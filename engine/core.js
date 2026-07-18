// ============================================================
// GameCore — motor de simulação headless (browser + Node)
// Extraído do objeto `game` de js/main.js: TODA a simulação, ZERO DOM/UI.
// Todo efeito não-simulado é sinalizado via this.emit(ev) (ver §2 do contrato).
// ============================================================
'use strict';

// Compatibilidade dual: no browser DATA/U/Aircraft/Commands são globais (os
// scripts irmãos já carregaram); em Node importa-os e publica em globalThis.
if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  if (typeof DATA === 'undefined') {
    const _d = require('./data.js');
    globalThis.DATA = _d.DATA;
    globalThis.U = _d.U;
  }
  if (typeof Emergency === 'undefined') globalThis.Emergency = require('./emergency.js').Emergency;
  if (typeof Aircraft === 'undefined') globalThis.Aircraft = require('./aircraft.js').Aircraft;
  if (typeof Commands === 'undefined') globalThis.Commands = require('./commands.js').Commands;
}

class GameCore {
  // airportJson: JSON completo do aeroporto (será aplicado em DATA)
  // opts: { cfg, traffic, emit }
  constructor(airportJson, opts = {}) {
    if (airportJson) DATA.setAirport(airportJson);
    // emit(ev) — canal de efeitos não-simulados; ausente = no-op (headless puro)
    this.emit = opts.emit || (() => {});

    this.aircraft = [];
    this.selected = null;       // contexto de seleção p/ runCommand (o cliente sincroniza)
    this.score = 0;
    this.time = 0;              // segundos de simulação
    this.cfg = opts.cfg || DATA.AIRPORT.defaultCfg || Object.keys(DATA.CONFIGS)[0];
    this.traffic = opts.traffic || 'normal'; // calmo | normal | pico
    // uso de cada pista do fluxo ativo: 'pouso' | 'dec' | 'ambas'
    this.runwayUse = this._defaultRunwayUse();
    this.stats = { landed: 0, departed: 0, goarounds: 0, sepLoss: 0 };
    this.usedCs = new Set();
    this.nextArr = 10; this.nextDep = 20; this.nextHeli = 150;
    this.pendingRadio = [];     // mensagens de piloto com atraso
    this.sepPairs = new Map();  // pares em perda de separação: key -> {t, next}
    this.conflictPairs = [];    // pares em alerta (para desenhar no radar)
    this.airportState = { state: 'normal', label: Emergency.labelAirportState('normal'), active: [] };
    this.recoveryUntil = 0;
    this.nextEmergencyRoll = U.rnd(90, 170);
    this.emergencyRunwayBlock = { until: 0, pair: null, reason: '' };

    // meteorologia dinâmica
    this.weather = null; this.atisIdx = 0; this.wxMin = 0; this.metarT = 0; this.windEvent = null;

    this.started = false;
    this._begin();
  }

  // assume a posição: meteorologia inicial e tráfego de partida
  _begin() {
    this.initWeather();
    this.started = true;
    this.emit({ type: 'radio', who: 'sys',
      text: 'Posição assumida. ' + DATA.CONFIGS[this.cfg].label + '. Vento ' + this.windStr() + '. Bom serviço!' });
    // tráfego inicial
    this.spawnArrival();
    this.nextArr = U.rnd(20, 35);
    this.nextDep = U.rnd(8, 15);
    this.nextHeli = U.rnd(120, 260);
    this.spawnDeparture();
    this.syncAirportState();
  }

  // ---------- utilidades ----------
  clock() {
    const base = 13 * 3600 + 20 * 60; // 13:20Z início do turno
    const t = base + Math.floor(this.time);
    const h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60, s = t % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  windStr() {
    const w = this.weather || (DATA.CONFIGS[this.cfg] && DATA.CONFIGS[this.cfg].wind);
    if (!w) return '—';
    return `${U.fmtHdg(w.dir)}°/${Math.round(w.spd)}kt`;
  }

  // ---------- meteorologia dinâmica ----------
  initWeather() {
    const w = DATA.CONFIGS[this.cfg].wind;
    this.weather = {
      dir: U.norm360(w.dir + U.rnd(-10, 10)),
      spd: Math.max(3, w.spd + U.rnd(-2, 2)),
      qnh: Math.round(U.rnd(1010, 1022)),
      temp: Math.round(U.rnd(21, 29)),
    };
    this.atisIdx = 0; this.wxMin = 0; this.metarT = 0;
    this.windEvent = { at: this.time + U.rnd(1100, 2200), target: null, spdT: null };
  }

  updateWeather(h) {
    if (!this.weather) return;
    this.wxMin += h;
    if (this.wxMin >= 60) { // a cada minuto simulado
      this.wxMin = 0;
      const w = this.weather;
      if (this.windEvent && this.windEvent.target !== null) {
        // frente passando: o vento gira até a direção-alvo
        const diff = U.adiff(w.dir, this.windEvent.target);
        if (Math.abs(diff) <= 12) {
          w.dir = this.windEvent.target;
          this.windEvent = { at: this.time + U.rnd(1400, 2600), target: null, spdT: null };
          this.publishAtis('o vento estabilizou');
        } else {
          w.dir = U.norm360(w.dir + Math.sign(diff) * 12);
        }
        if (this.windEvent && this.windEvent.spdT !== null)
          w.spd += Math.sign(this.windEvent.spdT - w.spd) * Math.min(1.5, Math.abs(this.windEvent.spdT - w.spd));
      } else {
        // deriva normal
        w.dir = U.norm360(w.dir + U.rnd(-5, 5));
        w.spd = Math.max(2, Math.min(22, w.spd + U.rnd(-0.8, 0.8)));
        if (this.windEvent && this.time >= this.windEvent.at) {
          this.windEvent.target = U.norm360(w.dir + U.pick([150, 180, 200, -150, -170]));
          this.windEvent.spdT = U.rnd(8, 16);
          this.emit({ type: 'radio', who: 'sys', text: 'Meteorologia: o vento está mudando de direção…', cls: '' });
        }
      }
    }
    // novo METAR/ATIS a cada 30 min
    this.metarT += h;
    if (this.metarT >= 1800) { this.metarT = 0; this.publishAtis(); }
  }

  publishAtis(extra) {
    this.atisIdx++;
    this.emit({ type: 'atis', letter: this.atisLetter(), metar: this.metar(), extra: extra || '' });
    const tw = this.tailwind();
    if (tw >= 8) {
      this.emit({ type: 'banner',
        text: `Vento de cauda de ${Math.round(tw)} kt na pista ${DATA.CONFIGS[this.cfg].arrRwy} — avalie trocar a configuração (botão ATIS)`,
        cls: 'bad' });
      this.emit({ type: 'chime' });
    }
  }

  atisLetter() {
    return String.fromCharCode(65 + (this.atisIdx % 26));
  }

  metar() {
    const w = this.weather;
    if (!w) return '—';
    const hhmm = this.clock().slice(0, 5).replace(':', '');
    let ddd = Math.round(w.dir / 10) * 10;
    if (ddd === 0) ddd = 360;
    const dew = w.temp - 7;
    return `METAR ${DATA.AIRPORT.icao} 14${hhmm}Z ${String(ddd).padStart(3, '0')}${String(Math.round(w.spd)).padStart(2, '0')}KT 9999 FEW025 SCT080 ${w.temp}/${dew} Q${w.qnh}`;
  }

  // componente de vento de cauda na pista de pouso da configuração (kt, >0 = cauda)
  tailwind(cfgKey) {
    const cfg = DATA.CONFIGS[cfgKey || this.cfg];
    if (!cfg || !this.weather) return 0;
    const r = DATA.RUNWAYS[cfg.arrRwy];
    return -this.weather.spd * Math.cos(U.d2r(this.weather.dir - r.hdg));
  }

  // ---------- uso das pistas do fluxo ativo ----------
  // Além de inverter as cabeceiras (setConfig 09↔27), cada pista do fluxo pode
  // ser dedicada a POUSO, a DECOLAGEM ou operar AMBAS (operação mista).
  cfgRunways(cfgKey) {
    const c = DATA.CONFIGS[cfgKey || this.cfg];
    if (!c) return [];
    return c.runways || [...new Set([c.arrRwy, c.depRwy])];
  }
  _defaultRunwayUse() {
    const c = DATA.CONFIGS[this.cfg];
    const use = {};
    for (const r of this.cfgRunways()) use[r] = 'ambas';
    if (c && c.arrRwy !== c.depRwy) { use[c.arrRwy] = 'pouso'; use[c.depRwy] = 'dec'; }
    return use;
  }
  arrRwys() { return this.cfgRunways().filter(r => this.runwayUse[r] !== 'dec'); }
  depRwys() { return this.cfgRunways().filter(r => this.runwayUse[r] !== 'pouso'); }
  runwayUseLabel() {
    return 'Pouso: ' + this.arrRwys().join('/') + ' · Decolagem: ' + this.depRwys().join('/');
  }
  // define o uso de UMA pista; garante ao menos uma de pouso e uma de decolagem
  setRunwayUse(rwy, use) {
    if (!this.cfgRunways().includes(rwy)) return { err: 'pista fora do fluxo ativo' };
    if (!['pouso', 'dec', 'ambas'].includes(use)) return { err: 'uso inválido' };
    const prev = this.runwayUse[rwy];
    if (prev === use) return { ok: true };
    this.runwayUse[rwy] = use;
    if (!this.arrRwys().length || !this.depRwys().length) {
      this.runwayUse[rwy] = prev;
      return { err: 'é preciso manter ao menos uma pista de pouso e uma de decolagem' };
    }
    const lbl = this.runwayUseLabel();
    this.emit({ type: 'config', cfg: this.cfg,
      label: DATA.AIRPORT.icao + ' ' + DATA.AIRPORT.name + ' · ' + lbl });
    this.publishAtis('novo uso de pistas em vigor');
    this.emit({ type: 'radio', who: 'sys', text: 'USO DE PISTAS — ' + lbl });
    this.emit({ type: 'banner', text: lbl });
    return { ok: true };
  }

  // troca de pistas em uso durante o jogo (inversão de cabeceiras / fluxo)
  setConfig(k) {
    if (k === this.cfg || !DATA.CONFIGS[k]) return;
    this.cfg = k;
    const c = DATA.CONFIGS[k];
    this.runwayUse = this._defaultRunwayUse(); // novo fluxo volta ao padrão da carta
    const dep0 = this.depRwys()[0];
    // saídas ainda taxiando são re-alocadas para a nova configuração
    for (const a of this.aircraft) {
      if (a.kind === 'dep' && a.state === 'taxi') {
        a.rwy = dep0;
        const oldExit = DATA.SIDS[a.sid] && DATA.SIDS[a.sid].exit;
        const nova = Object.entries(DATA.SIDS).find(([, s]) => s.cfg === k && s.exit === oldExit);
        if (nova) a.sid = nova[0];
      }
    }
    this.emit({ type: 'config', cfg: k,
      label: DATA.AIRPORT.icao + ' ' + DATA.AIRPORT.name + ' · ' + c.label });
    this.publishAtis('nova configuração em vigor');
    this.emit({ type: 'radio', who: 'sys', text: 'PISTAS EM USO: ' + c.label });
    this.emit({ type: 'banner', text: 'Pistas em uso — ' + this.runwayUseLabel() });
    // aeronaves já no ponto de espera antigo: lembre o jogador do comando TAXI
    if (this.aircraft.some(a => a.kind === 'dep' &&
        ['holdshort', 'lineup'].includes(a.state) &&
        !this.depRwys().some(r => DATA.RWY_PAIR[a.rwy] === DATA.RWY_PAIR[r])))
      this.emit({ type: 'radio', who: 'sys',
        text: 'Há saídas na cabeceira antiga — use "TAXI ' + dep0 + '" para reposicioná-las.' });
  }

  // conclusão de transferência ao Centro (manual = via comando HO)
  completeHandoff(ac, manual) {
    if (ac.state === 'done') return;
    ac.state = 'done';
    ac.handedOff = true;
    this.stats.departed++;
    if (manual) this.addScore(100, ac.cs + ' transferido ao Centro no momento certo');
    else if (ac.alt >= 9500) this.addScore(60, ac.cs + ' transferido automaticamente (use HO e pontue mais)');
    else this.addScore(30, ac.cs + ' transferido baixo e automaticamente');
  }

  trafficRates() {
    // segundos médios entre chegadas/saídas
    const base = { calmo: [110, 130], normal: [75, 90], pico: [50, 60] }[this.traffic];
    // aperta levemente com o tempo de jogo (até -25%)
    const f = Math.max(0.75, 1 - this.time / 3600 * 0.25);
    const op = this.airportState && this.airportState.state;
    const factor = op === 'emergency' ? 1.55 : op === 'recovery' ? 1.2 : 1;
    return [base[0] * f * factor, base[1] * f * factor];
  }

  // rádio do piloto com pequeno atraso (imersão)
  radioPilot(ac, text, delay) {
    const perf = ac && ac.effectivePerf ? ac.effectivePerf() : null;
    const factor = perf && perf.responseDelayFactor ? perf.responseDelayFactor : 1;
    this.pendingRadio.push({ ac, text, at: this.time + (delay ?? U.rnd(0.6, 1.6)) * factor });
  }

  addScore(n, why) {
    this.score = Math.max(0, this.score + n);
    this.emit({ type: 'score', delta: n, why, total: this.score });
  }

  syncAirportState() {
    this.airportState = Emergency.operationalState(this);
  }

  shouldHoldDeparture(rwy, except) {
    const pair = DATA.RWY_PAIR[rwy];
    if (this.emergencyRunwayBlock.until > this.time && this.emergencyRunwayBlock.pair === pair) return true;
    return this.aircraft.some(a => a !== except &&
      a.emergency && a.emergency.active &&
      a.kind === 'arr' &&
      a.state !== 'done' &&
      (
        ['high', 'critical'].includes(a.emergency.severity) ||
        DATA.RWY_PAIR[(a.emergency.info && a.emergency.info.runway) || a.app.rwy || DATA.CONFIGS[this.cfg].arrRwy] === pair
      ) &&
      ['declared', 'identified', 'assessed', 'coordinating', 'vectoring', 'approach', 'landing', 'post-landing'].includes(a.emergency.stage));
  }

  startEmergency(ac, kind, opts) {
    if (!ac || ac.state === 'done') return null;
    ac.emergency = Emergency.create(kind, ac, this, opts || {});
    if (ac.pilotAi) ac.pilotAi.nextAt = this.time + U.rnd(18, 35);
    this.syncAirportState();
    this.radioPilot(ac, Emergency.declareText(ac), 0.2);
    this.emit({ type: 'banner', text: 'EMERGÊNCIA: ' + ac.cs + ' — ' + ac.emergency.title, cls: 'bad' });
    this.emit({ type: 'radio', who: 'sys', text: 'Estado operacional do aeroporto: EMERGÊNCIA. Priorize ' + ac.cs + ' e reorganize o fluxo.', cls: 'bad' });
    for (const other of this.aircraft) {
      if (other === ac || other.state === 'done') continue;
      if (other.airborne && other.kind === 'arr' && U.dist(0, 0, other.x, other.y) < 28 && other.app.phase === 'none')
        this.radioPilot(other, 'ciente prioridade para ' + ac.cs + ', podemos aceitar vetores ou espera', U.rnd(2, 6));
      if (other.kind === 'dep' && ['taxi', 'holdshort', 'lineup'].includes(other.state))
        this.radioPilot(other, 'mantendo posição, aguardando prioridade da emergência ' + ac.cs, U.rnd(2, 6));
    }
    this.emit({ type: 'chime' });
    return ac.emergency;
  }

  finishEmergency(ac, outcome, note) {
    if (!ac || !ac.emergency) return;
    ac.emergency.active = false;
    ac.emergency.outcome = outcome;
    ac.emergency.resultNote = note || '';
    ac.emergency.stage = 'closed';
    this.recoveryUntil = Math.max(this.recoveryUntil, this.time + 150);
    this.syncAirportState();
    this.emit({ type: 'radio', who: 'sys', text: ac.cs + ': emergência encerrada. Aeroporto em recuperação.', cls: 'good' });
  }

  maybeStartUnexpectedEmergency(dt) {
    this.nextEmergencyRoll -= dt;
    if (this.nextEmergencyRoll > 0) return;
    this.nextEmergencyRoll = U.rnd(120, 220);
    const active = this.aircraft.some(a => a.emergency && a.emergency.active && a.state !== 'done');
    if (active) return;
    if (Math.random() > 0.45) return;
    const candidates = this.aircraft.filter(a =>
      a.airborne &&
      (a.kind === 'arr' || a.kind === 'dep') &&
      !a.emergency &&
      this.time - a.spawnT > 45
    );
    if (!candidates.length) return;
    const pools = candidates
      .map(ac => ({ ac, kinds: Emergency.randomKindsFor(ac, this) }))
      .filter(item => item.kinds.length);
    if (!pools.length) return;
    const chosen = U.pick(pools);
    this.startEmergency(chosen.ac, U.pick(chosen.kinds));
  }

  handleEmergencyState(ac) {
    if (!ac || !ac.emergency) return;
    const stageChange = Emergency.syncStage(ac, this);
    if (stageChange) {
      if (stageChange.to === 'identified')
        this.emit({ type: 'radio', who: 'sys', text: ac.cs + ': natureza da emergência identificada como ' + ac.emergency.info.nature + '.', cls: 'bad' });
      if (stageChange.to === 'assessed')
        this.emit({ type: 'radio', who: 'sys', text: ac.cs + ': avaliação recebida (POB ' + ac.emergency.info.souls + ', combustível ' + ac.emergency.info.fuelMin + ' min).', cls: 'bad' });
      if (stageChange.to === 'coordinating' && !ac.emergency.flags.coordinated) {
        ac.emergency.flags.coordinated = true;
        this.emit({ type: 'radio', who: 'sys', text: 'Serviços de emergência acionados para ' + ac.cs, cls: 'bad' });
      }
      if (stageChange.to === 'vectoring')
        this.emit({ type: 'radio', who: 'sys', text: ac.cs + ': fase de vetoração de emergência em andamento.', cls: 'bad' });
      if (stageChange.to === 'approach')
        this.emit({ type: 'radio', who: 'sys', text: ac.cs + ': aproximação prioritária em curso.', cls: 'bad' });
      if (stageChange.to === 'landing')
        this.emit({ type: 'radio', who: 'sys', text: ac.cs + ': comprometido para pouso prioritário.', cls: 'bad' });
      if (stageChange.to === 'post-landing')
        this.emit({ type: 'radio', who: 'sys', text: ac.cs + ': pós-pouso de emergência, mantenha a pista protegida.', cls: 'bad' });
    }
    const evolution = Emergency.maybeEvolve(ac, this);
    if (evolution && evolution.text) this.radioPilot(ac, evolution.text, 0.5);
  }

  onPositionReport(ac, report) {
    if (!ac || !report) return;
    this.radioPilot(ac, ac.reportText(report, this), 0.2);
  }

  maybePilotInitiative(ac) {
    if (!ac || !ac.airborne || ac.state === 'done' || !ac.pilotAi) return;
    if (this.time < ac.pilotAi.nextAt) return;
    const ai = ac.ensurePilotAi ? ac.ensurePilotAi() : ac.pilotAi;
    if (ai.standbyUntil && this.time < ai.standbyUntil) {
      ai.nextAt = ai.standbyUntil;
      return;
    }
    if (ac.hasPendingReport && ac.hasPendingReport()) {
      ai.nextAt = this.time + U.rnd(45, 80);
      return;
    }
    let text = null;
    let ask = null;
    if (ac.emergency && ac.emergency.active) {
      text = Emergency.initiative(ac);
      ai.nextAt = this.time + U.rnd(50, 90);
    } else if (ai.pendingAsk && ai.standbyUntil && this.time >= ai.standbyUntil) {
      // atualização após espera longa
      text = 'solicitamos atualização';
      ai.nextAt = this.time + U.rnd(100, 160);
      ai.standbyUntil = 0;
    } else if (ac.kind === 'arr' && ac.nav.mode === 'route' && !ac.via && U.dist(0, 0, ac.x, ac.y) < 30 && ac.alt > 9000) {
      text = 'solicitamos descida ou vetores para a aproximação';
      ask = 'descent';
      ai.nextAt = this.time + U.rnd(90, 140);
    } else if (ac.kind === 'arr' && ac.nav.mode === 'hold') {
      text = 'solicitamos previsão para a aproximação';
      ask = 'hold';
      ai.askedHold = true;
      ai.nextAt = this.time + U.rnd(110, 160);
    } else if (ac.kind === 'arr' && ac.app.phase === 'none' && ac.nav.mode === 'hdg' && U.dist(0, 0, ac.x, ac.y) < 18) {
      text = 'solicitamos vetores para a final';
      ask = 'vectors';
      ai.askedVectors = true;
      ai.nextAt = this.time + U.rnd(90, 140);
    } else if (ac.kind === 'arr' && ac.app.phase !== 'none' && !ac.landClr && U.dist(0, 0, ac.x, ac.y) < 8) {
      text = 'solicitamos autorização de pouso';
      ask = 'land';
      ai.nextAt = this.time + U.rnd(70, 110);
    } else if (ac.kind === 'dep') {
      const exitFix = DATA.SIDS[ac.sid] && DATA.SIDS[ac.sid].exit;
      const nearExit = exitFix && ac.fixDist(exitFix) < 14;
      if (ac.alt >= 8500 && nearExit && !ac.handedOff) {
        text = 'prontos para transferência ao Centro';
        ask = 'center';
        ai.askedCenter = true;
        ai.nextAt = this.time + U.rnd(90, 140);
      } else if (ac.airborne && ac.clrAlt <= 5000 && ac.alt > 4200 && !ac.emergency) {
        text = 'nivelando 5.000, solicitamos subida adicional quando disponível';
        ask = 'climb';
        ai.nextAt = this.time + U.rnd(100, 150);
      } else {
        ai.nextAt = this.time + U.rnd(70, 110);
      }
    } else {
      ai.nextAt = this.time + U.rnd(80, 130);
    }
    if (ask) ac.markPilotAsk(ask);
    if (text) this.radioPilot(ac, text, 0.4);
  }

  // ---------- geração de tráfego ----------
  newCallsign(airline) {
    for (let i = 0; i < 50; i++) {
      const n = Math.floor(U.rnd(1000, 9999));
      const cs = airline.code + n;
      if (!this.usedCs.has(cs)) { this.usedCs.add(cs); return cs; }
    }
    return airline.code + Math.floor(U.rnd(100, 999));
  }

  spawnArrival() {
    const stars = Object.entries(DATA.STARS).filter(([, s]) => s.cfg === this.cfg);
    const [starId, star] = U.pick(stars);
    const airline = U.pickW(DATA.AIRLINES);
    const type = U.pick(airline.types);
    const entry = U.fix(star.entry);
    const alt = Math.round(U.rnd(15, 19)) * 1000;
    const route = star.route.map(r => r.fix);
    const ac = new Aircraft({
      cs: this.newCallsign(airline), radio: airline.radio, type,
      kind: 'arr', x: entry[0], y: entry[1], alt, spd: 290,
      hdg: U.brg(entry[0], entry[1], U.fix(route[1])[0], U.fix(route[1])[1]),
      star: starId,
      nav: { mode: 'route', route, idx: 1 },
      spawnT: this.time,
    });
    ac.clrAlt = alt;
    this.aircraft.push(ac);
    this.radioPilot(ac, `bom dia, nível ${Math.round(alt / 100)}, chegada ${starId}`, 0.3);
  }

  spawnDeparture() {
    const sids = Object.entries(DATA.SIDS).filter(([, s]) => s.cfg === this.cfg);
    const [sidId, sid] = U.pick(sids);
    const airline = U.pickW(DATA.AIRLINES);
    const type = U.pick(airline.types);
    const ac = new Aircraft({
      cs: this.newCallsign(airline), radio: airline.radio, type,
      kind: 'dep', state: 'taxi', timer: U.rnd(25, 70),
      sid: sidId, dest: U.pick(DATA.DESTS[sid.exit]),
      spawnT: this.time,
    });
    // qualquer pista de decolagem do uso atual (alterna quando há mais de uma)
    const deps = this.depRwys();
    this._depRR = ((this._depRR || 0) + 1) % Math.max(1, deps.length);
    ac.rwy = deps[this._depRR] || DATA.CONFIGS[this.cfg].depRwy;
    ac.clrAlt = 5000;
    this.aircraft.push(ac);
  }

  // helicóptero VFR que cruzará a zona do aeródromo (raio 5 NM)
  spawnHeli() {
    const th = U.rnd(0, 360);
    const R0 = 22;
    const ex = Math.sin(U.d2r(th)) * R0, ey = Math.cos(U.d2r(th)) * R0;
    // saída do outro lado, com desvio para a rota passar perto do aeródromo
    const thOut = U.norm360(th + 180 + U.rnd(-20, 20));
    const wptExit = [Math.sin(U.d2r(thOut)) * R0, Math.cos(U.d2r(thOut)) * R0];
    const type = U.pick(['H125', 'R44', 'AW39']);
    const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const cs = 'PR-' + L() + L() + L();
    const ac = new Aircraft({
      cs, radio: 'Helicóptero ' + cs.replace('-', ' '), type,
      kind: 'hel', x: ex, y: ey,
      alt: U.pick([1500, 2000, 2500, 3000]), spd: 100,
      hdg: U.brg(ex, ey, wptExit[0], wptExit[1]),
      spawnT: this.time,
    });
    ac.clrAlt = ac.alt;
    ac.wptExit = wptExit;
    ac.heliAuto = true;
    ac.heliState = 'inbound';
    ac.crossRequested = true;
    ac.crossCleared = false;
    ac.zoneEntered = false;
    this.usedCs.add(cs);
    this.aircraft.push(ac);
    this.radioPilot(ac, `boa tarde, helicóptero ${type} VFR, ${Math.round(U.dist(0, 0, ex, ey))} milhas ao ` +
      `${this.cardinal(th + 180)}, ${U.fmtAlt(ac.alt)}, vamos cruzar a zona do aeródromo`, 0.4);
  }

  cardinal(brg) {
    const dirs = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
    return dirs[Math.round(U.norm360(brg) / 45) % 8];
  }

  onHeliCrossed(ac) {
    this.addScore(50, ac.cs + ' cruzou a zona coordenado');
    this.radioPilot(ac, 'cruzamento concluído, obrigado, bom serviço', 1);
  }

  // ---------- pista ----------
  runwayOccupied(rwy, except) {
    const pair = DATA.RWY_PAIR[rwy];
    if (this.emergencyRunwayBlock.until > this.time && this.emergencyRunwayBlock.pair === pair) return true;
    return this.aircraft.some(a => a !== except && a.state !== 'done' &&
      ['lineup', 'takeoff', 'rollout', 'abort'].includes(a.state) && DATA.RWY_PAIR[a.rwy] === pair);
  }

  touchdown(ac) {
    ac.state = 'rollout';
    ac.rwy = ac.app.rwy;
    ac.hdg = DATA.RUNWAYS[ac.rwy].hdg;
    ac.alt = 0; ac.vs = 0;
    ac.timer = U.rnd(8, 14); // tempo para livrar após autorização + desaceleração
    ac.vacateClr = false;
    ac.vacateSide = null;
    ac.app = { phase: 'none', rwy: null };
    this.stats.landed++;
    let pts = 100;
    if (ac.emergency && ac.emergency.active) {
      pts += 150;
      this.emit({ type: 'radio', who: 'sys', text: ac.cs + ' (emergência) pousou em segurança — bônus!', cls: 'good' });
      const outcome = (ac.emergency.kind === 'engine-fire' || ac.emergency.kind === 'cockpit-smoke' || ac.emergency.kind === 'bomb-threat')
        ? 'evacuação'
        : 'pouso seguro';
      ac.emergency.outcome = outcome;
      ac.emergency.resultNote = outcome === 'evacuação' ? 'equipes de emergência na pista' : 'inspeção após o pouso';
      ac.emergency.stage = 'post-landing';
      ac.timer = outcome === 'evacuação' ? U.rnd(28, 40) : U.rnd(16, 24);
      this.emergencyRunwayBlock = {
        until: this.time + (outcome === 'evacuação' ? 85 : 35),
        pair: DATA.RWY_PAIR[ac.rwy],
        reason: outcome,
      };
      this.emit({ type: 'radio', who: 'sys',
        text: outcome === 'evacuação'
          ? ac.cs + ': evacuação prevista, pista temporariamente interditada.'
          : ac.cs + ': equipes acompanhando o desembarque, mantenha a pista protegida.',
        cls: 'bad' });
      this.syncAirportState();
    }
    this.addScore(pts, ac.cs + ' pousou pista ' + ac.rwy);
    this.radioPilot(ac, `pousado pista ${ac.rwy}, aguardando`, 2.5);
    this.emit({ type: 'chime' });
  }

  onGoAround(ac, reason) {
    this.stats.goarounds++;
    this.addScore(-100, ac.cs + ' arremeteu: ' + reason);
    this.radioPilot(ac, `arremetendo, ${reason}`, 0.4);
    if (ac.emergency && ac.emergency.active) {
      ac.emergency.outcome = 'arremetida';
      ac.emergency.resultNote = reason;
      this.syncAirportState();
    }
    this.emit({ type: 'chime' });
  }

  onRunwayVacated(ac) {
    if (!ac || !ac.rwy) return;
    if (ac.emergency && ac.emergency.outcome) {
      const note = ac.emergency.outcome === 'evacuação'
        ? 'evacuação concluída e pista liberada'
        : 'aeronave liberou a pista';
      this.finishEmergency(ac, ac.emergency.outcome, note);
    }
  }

  // executa uma instrução condicional que atingiu a condição (APOS)
  execPending(ac, p) {
    const { results } = Commands.run(ac, p.tokens, this);
    const rbs = results.filter(r => r && r.rb).map(r => r.rb);
    const errText = (typeof PilotReply !== 'undefined' && PilotReply.formatMany)
      ? PilotReply.formatMany(results.filter(r => r && r.err))
      : null;
    if (rbs.length) this.radioPilot(ac, rbs.join(', '), 0.3);
    if (errText) this.radioPilot(ac, errText, 0.3);
  }

  // ---------- comandos ----------
  // retorna { ok, err?, cs?, early? }; emite radio (atc/piloto/sys) e efeitos
  runCommand(line) {
    const res = Commands.parse(line, this);
    if (!res) return { ok: false };
    if (res.err) { this.emit({ type: 'radio', who: 'sys', text: res.err, cls: 'bad' }); return { ok: false, err: res.err }; }
    const { ac, results, atcText } = res;
    if (atcText) this.emit({ type: 'radio', who: 'atc', cs: ac.cs, radio: ac.radio, text: atcText + '.' });
    const rbs = [], errResults = [];
    for (const r of results) {
      if (!r) continue;
      if (r.err) errResults.push(r);
      else if (r.rb) rbs.push(r.rb);
    }
    if (rbs.length) this.radioPilot(ac, rbs.join(', '));
    const errText = (typeof PilotReply !== 'undefined' && PilotReply.formatMany)
      ? PilotReply.formatMany(errResults)
      : (errResults.length ? 'Negativo, ' + errResults.map(r => r.err).join('; ') : null);
    if (errText) this.radioPilot(ac, errText);
    const early = results.some(r => r && r.early);
    return { ok: true, cs: ac.cs, early };
  }

  // ---------- conflitos ----------
  checkConflicts(dt) {
    const thr = (typeof Separation !== 'undefined' && Separation.thresholds)
      ? Separation.thresholds()
      : { nm: 3, ft: 1000, predictNm: 3.2 };
    const air = this.aircraft.filter(a => a.airborne && a.alt > 400);
    for (const a of air) a.stca = 0;
    this.conflictPairs = [];
    let anyLoss = false;
    for (let i = 0; i < air.length; i++) for (let j = i + 1; j < air.length; j++) {
      const a = air[i], b = air[j];
      // regras do aeroporto (paralelas independentes, etc.)
      if (typeof Separation !== 'undefined' && Separation.isExempt(a, b)) continue;

      const d = U.dist(a.x, a.y, b.x, b.y);
      const dz = Math.abs(a.alt - b.alt);
      const key = a.cs + '|' + b.cs;
      if (d < thr.nm && dz < thr.ft) {
        a.stca = b.stca = 2; anyLoss = true;
        this.conflictPairs.push({ a, b, d, loss: true });
        let e = this.sepPairs.get(key);
        if (!e) {
          e = { t: 0, next: 5 };
          this.sepPairs.set(key, e);
          this.stats.sepLoss++;
          this.addScore(-200, 'PERDA DE SEPARAÇÃO: ' + a.cs + ' × ' + b.cs);
        }
        // penalidade contínua enquanto o conflito durar
        e.t += dt || 0;
        if (e.t >= e.next) {
          e.next += 5;
          this.addScore(-25, `conflito persiste há ${Math.round(e.t)} s: ${a.cs} × ${b.cs}`);
        }
      } else {
        if (d > thr.nm + 2 || dz > thr.ft + 400) this.sepPairs.delete(key);
        // previsão 60 s (linear)
        const t = 60 / 3600;
        const ax = a.x + Math.sin(U.d2r(a.hdg)) * a.spd * t, ay = a.y + Math.cos(U.d2r(a.hdg)) * a.spd * t;
        const bx = b.x + Math.sin(U.d2r(b.hdg)) * b.spd * t, by = b.y + Math.cos(U.d2r(b.hdg)) * b.spd * t;
        const df = U.dist(ax, ay, bx, by);
        const za = a.alt + a.vs, zb = b.alt + b.vs;
        if (Math.min(d, df) < thr.predictNm && (dz < thr.ft || Math.abs(za - zb) < thr.ft)) {
          if (a.stca === 0) a.stca = 1;
          if (b.stca === 0) b.stca = 1;
          this.conflictPairs.push({ a, b, d, loss: false });
        }
      }
    }
    this.emit({ type: 'alarm', on: anyLoss });
  }

  // ---------- limites / transferências ----------
  checkBoundaries() {
    for (const ac of this.aircraft) {
      if (!ac.airborne) continue;
      const d = U.dist(0, 0, ac.x, ac.y);
      if (ac.kind === 'dep') {
        const exitFix = DATA.SIDS[ac.sid]?.exit;
        const nearExit = exitFix && ac.fixDist(exitFix) < 3;
        if (d > DATA.AIRPORT.range - 2 || nearExit) {
          this.radioPilot(ac, 'chamando o Centro, obrigado, até logo', 0.3);
          this.completeHandoff(ac, false);
        }
      } else if (ac.kind === 'hel') {
        if (d > DATA.AIRPORT.range - 20) ac.state = 'done'; // deixou a área baixa
      } else if (d > DATA.AIRPORT.range + 3 && !ac.offRadarPenalized) {
        ac.offRadarPenalized = true;
        ac.state = 'done';
        this.addScore(ac.emergency && ac.emergency.active ? -250 : -150,
          ac.cs + ' saiu da TMA sem controle' + (ac.emergency && ac.emergency.active ? ' durante emergência' : ''));
      }
    }
  }

  // ---------- loop ----------
  // avança a simulação (substeps internos como antes); dt já vem escalado pelo cliente
  tick(dt) {
    if (!this.started) return;
    // subpassos para estabilidade em velocidade acelerada
    const steps = Math.max(1, Math.ceil(dt / 0.5));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.time += h;
      this.updateWeather(h);
      if (this.emergencyRunwayBlock.until <= this.time) this.emergencyRunwayBlock = { until: 0, pair: null, reason: '' };
      for (const ac of this.aircraft) {
        ac.update(h, this);
        this.handleEmergencyState(ac);
        this.maybePilotInitiative(ac);
      }

      // rádio pendente
      for (let i = this.pendingRadio.length - 1; i >= 0; i--) {
        const m = this.pendingRadio[i];
        if (this.time >= m.at) {
          if (m.ac.state !== 'done' || m.ac.handedOff || m.ac.rwy)
            this.emit({ type: 'radio', who: 'pilot', ac: m.ac, cs: m.ac.cs, text: m.text });
          this.pendingRadio.splice(i, 1);
        }
      }

      // spawns
      this.nextArr -= h; this.nextDep -= h; this.nextHeli -= h;
      this.maybeStartUnexpectedEmergency(h);
      const [ra, rd] = this.trafficRates();
      const arrCount = this.aircraft.filter(a => a.kind === 'arr' && a.state !== 'done').length;
      const depCount = this.aircraft.filter(a => a.kind === 'dep' && a.state !== 'done').length;
      const helCount = this.aircraft.filter(a => a.kind === 'hel' && a.state !== 'done').length;
      if (this.nextArr <= 0) { if (arrCount < 9) this.spawnArrival(); this.nextArr = U.rnd(ra * 0.7, ra * 1.3); }
      if (this.nextDep <= 0) { if (depCount < 7) this.spawnDeparture(); this.nextDep = U.rnd(rd * 0.7, rd * 1.3); }
      if (this.nextHeli <= 0) { if (helCount < 2) this.spawnHeli(); this.nextHeli = U.rnd(240, 480); }
    }

    this.checkConflicts(dt);
    this.checkBoundaries();
    this.aircraft = this.aircraft.filter(a => a.state !== 'done');
    this.syncAirportState();
    // a seleção (contexto de comando) é responsabilidade do cliente; se a
    // aeronave selecionada saiu, o cliente a limpa após o tick.
    if (this.selected && this.selected.state === 'done') this.selected = null;
  }

  // ---------- serialização (snapshot p/ rede) — §5 do contrato ----------
  serialize() {
    const W = this.weather || {};
    return {
      time: this.time,
      score: this.score,
      stats: { ...this.stats },
      weather: { dir: W.dir, spd: W.spd, qnh: W.qnh, temp: W.temp },
      atis: this.atisLetter(),
      cfg: this.cfg,
      runwayUse: { ...this.runwayUse },
      airportState: { ...this.airportState },
      aircraft: this.aircraft.map(a => ({
        cs: a.cs, radio: a.radio, type: a.type, kind: a.kind,
        x: a.x, y: a.y, alt: a.alt, spd: a.spd, hdg: a.hdg, vs: a.vs,
        clrAlt: a.clrAlt, clrSpd: a.clrSpd, spdMode: a.spdMode,
        state: a.state, nav: a.nav, app: a.app, landClr: a.landClr,
        star: a.star, sid: a.sid, dest: a.dest, rwy: a.rwy,
        emergency: Emergency.serialize(a.emergency), via: a.via, stca: a.stca,
        goingAround: a.goingAround, timer: a.timer,
        vacateClr: !!a.vacateClr, vacateSide: a.vacateSide || null,
        pilotAi: a.pilotAi ? {
          pendingAsk: a.pilotAi.pendingAsk || null,
          standbyUntil: a.pilotAi.standbyUntil || 0,
        } : null,
        heliState: a.heliState, heliAuto: a.heliAuto,
        hovering: !!a.hovering, hoverPos: a.hoverPos, hoverHdg: a.hoverHdg,
        crossRequested: a.crossRequested, crossCleared: a.crossCleared,
        wptExit: a.wptExit, trail: a.trail,
        pending: (a.pending || []).map(p => ({ label: p.label })),
        reports: (a.reports || []).map(r => ({ label: r.label })),
      })),
    };
  }
}

if (typeof module !== 'undefined') module.exports = { GameCore };
