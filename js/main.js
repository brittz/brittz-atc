// ============================================================
// Núcleo do jogo: loop, tráfego, conflitos, pontuação
// ============================================================
'use strict';

const game = {
  aircraft: [],
  selected: null,
  score: 0,
  time: 0,             // segundos de simulação
  simSpeed: 1,
  paused: false,
  started: false,
  cfg: '09',
  traffic: 'normal',   // calmo | normal | pico
  settings: { sound: true, tts: true, sweep: true, fixNames: true, trailLine: false },
  stats: { landed: 0, departed: 0, goarounds: 0, sepLoss: 0 },
  usedCs: new Set(),
  nextArr: 10, nextDep: 20, nextHeli: 150,
  pendingRadio: [],    // mensagens de piloto com atraso
  sepPairs: new Map(), // pares em perda de separação: key -> {t, next}
  conflictPairs: [],   // pares em alerta (para desenhar no radar)

  // ---------- persistência local (localStorage) ----------
  loadPrefs() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('atcv-settings') || '{}')); } catch (e) {}
  },
  savePrefs() {
    try { localStorage.setItem('atcv-settings', JSON.stringify(this.settings)); } catch (e) {}
  },
  record() {
    try { return JSON.parse(localStorage.getItem('atcv-record') || 'null'); } catch (e) { return null; }
  },
  saveRecordIfBest() {
    const rec = this.record();
    if (!rec || this.score > rec.score) {
      try {
        localStorage.setItem('atcv-record', JSON.stringify({
          score: this.score, landed: this.stats.landed, departed: this.stats.departed,
          date: new Date().toISOString().slice(0, 10),
        }));
      } catch (e) {}
    }
  },

  // ---------- utilidades ----------
  clock() {
    const base = 13 * 3600 + 20 * 60; // 13:20Z início do turno
    const t = base + Math.floor(this.time);
    const h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60, s = t % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  },
  windStr() {
    const w = this.weather || (DATA.CONFIGS[this.cfg] && DATA.CONFIGS[this.cfg].wind);
    if (!w) return '—';
    return `${U.fmtHdg(w.dir)}°/${Math.round(w.spd)}kt`;
  },

  // ---------- meteorologia dinâmica ----------
  weather: null, atisIdx: 0, wxMin: 0, metarT: 0, windEvent: null,

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
  },

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
          UI.logSys('Meteorologia: o vento está mudando de direção…', '');
        }
      }
    }
    // novo METAR/ATIS a cada 30 min
    this.metarT += h;
    if (this.metarT >= 1800) { this.metarT = 0; this.publishAtis(); }
  },

  publishAtis(extra) {
    this.atisIdx++;
    UI.logSys(`Informação ATIS ${this.atisLetter()} disponível${extra ? ' — ' + extra : ''}: ${this.metar()}`);
    const tw = this.tailwind();
    if (tw >= 8) {
      UI.flashBanner(`Vento de cauda de ${Math.round(tw)} kt na pista ${DATA.CONFIGS[this.cfg].arrRwy} — avalie trocar a configuração (botão ATIS)`, 'bad');
      UI.chime();
    }
  },

  atisLetter() {
    return String.fromCharCode(65 + (this.atisIdx % 26));
  },

  metar() {
    const w = this.weather;
    if (!w) return '—';
    const hhmm = this.clock().slice(0, 5).replace(':', '');
    let ddd = Math.round(w.dir / 10) * 10;
    if (ddd === 0) ddd = 360;
    const dew = w.temp - 7;
    return `METAR ${DATA.AIRPORT.icao} 14${hhmm}Z ${String(ddd).padStart(3, '0')}${String(Math.round(w.spd)).padStart(2, '0')}KT 9999 FEW025 SCT080 ${w.temp}/${dew} Q${w.qnh}`;
  },

  // componente de vento de cauda na pista de pouso da configuração (kt, >0 = cauda)
  tailwind(cfgKey) {
    const cfg = DATA.CONFIGS[cfgKey || this.cfg];
    if (!cfg || !this.weather) return 0;
    const r = DATA.RUNWAYS[cfg.arrRwy];
    return -this.weather.spd * Math.cos(U.d2r(this.weather.dir - r.hdg));
  },

  // troca de pistas em uso durante o jogo
  setConfig(k) {
    if (k === this.cfg || !DATA.CONFIGS[k]) return;
    this.cfg = k;
    const c = DATA.CONFIGS[k];
    // saídas ainda taxiando são re-alocadas para a nova configuração
    for (const a of this.aircraft) {
      if (a.kind === 'dep' && a.state === 'taxi') {
        a.rwy = c.depRwy;
        const oldExit = DATA.SIDS[a.sid] && DATA.SIDS[a.sid].exit;
        const nova = Object.entries(DATA.SIDS).find(([, s]) => s.cfg === k && s.exit === oldExit);
        if (nova) a.sid = nova[0];
      }
    }
    document.getElementById('cfgLabel').textContent =
      DATA.AIRPORT.icao + ' ' + DATA.AIRPORT.name + ' · ' + c.label;
    this.publishAtis('nova configuração em vigor');
    UI.logSys('PISTAS EM USO: ' + c.label);
    UI.flashBanner('Pistas em uso: pousos ' + c.arrRwy + ' · decolagens ' + c.depRwy);
    // aeronaves já no ponto de espera antigo: lembre o jogador do comando TAXI
    if (this.aircraft.some(a => a.kind === 'dep' &&
        ['holdshort', 'lineup'].includes(a.state) && DATA.RWY_PAIR[a.rwy] !== DATA.RWY_PAIR[c.depRwy]))
      UI.logSys('Há saídas na cabeceira antiga — use "TAXI ' + c.depRwy + '" para reposicioná-las.');
  },

  // conclusão de transferência ao Centro (manual = via comando HO)
  completeHandoff(ac, manual) {
    if (ac.state === 'done') return;
    ac.state = 'done';
    ac.handedOff = true;
    this.stats.departed++;
    if (manual) this.addScore(100, ac.cs + ' transferido ao Centro no momento certo');
    else if (ac.alt >= 9500) this.addScore(60, ac.cs + ' transferido automaticamente (use HO e pontue mais)');
    else this.addScore(30, ac.cs + ' transferido baixo e automaticamente');
  },
  rank() {
    const s = this.score;
    if (s < 300) return 'Estagiário';
    if (s < 800) return 'Controlador Jr.';
    if (s < 1600) return 'Controlador';
    if (s < 3000) return 'Controlador Sênior';
    return 'Supervisor de TMA';
  },
  trafficRates() {
    // segundos médios entre chegadas/saídas
    const base = { calmo: [110, 130], normal: [75, 90], pico: [50, 60] }[this.traffic];
    // aperta levemente com o tempo de jogo (até -25%)
    const f = Math.max(0.75, 1 - this.time / 3600 * 0.25);
    return [base[0] * f, base[1] * f];
  },

  select(a) {
    this.selected = a;
    if (a) document.getElementById('cmdInput').value = a.cs + ' ';
    UI.refreshSelPanel();
    UI.refreshStrips();
  },

  togglePause() {
    this.paused = !this.paused;
    document.getElementById('btnPause').classList.toggle('on', this.paused);
    document.getElementById('pausedTag').classList.toggle('hidden', !this.paused);
  },

  // rádio do piloto com pequeno atraso (imersão)
  radioPilot(ac, text, delay) {
    this.pendingRadio.push({ ac, text, at: this.time + (delay ?? U.rnd(0.6, 1.6)) });
  },

  addScore(n, why, cls) {
    this.score = Math.max(0, this.score + n);
    UI.logSys((n >= 0 ? '+' : '') + n + ' pts — ' + why, n >= 0 ? 'good' : 'bad');
    if (n < 0) UI.flashBanner(why + ' (' + n + ' pts)', 'bad');
    if (n > 0) this.saveRecordIfBest();
  },

  // ---------- geração de tráfego ----------
  newCallsign(airline) {
    for (let i = 0; i < 50; i++) {
      const n = Math.floor(U.rnd(1000, 9999));
      const cs = airline.code + n;
      if (!this.usedCs.has(cs)) { this.usedCs.add(cs); return cs; }
    }
    return airline.code + Math.floor(U.rnd(100, 999));
  },

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
      emergency: Math.random() < 0.05,
      spawnT: this.time,
    });
    ac.clrAlt = alt;
    this.aircraft.push(ac);
    const emg = ac.emergency ? ' — declarando EMERGÊNCIA, solicitamos prioridade' : '';
    this.radioPilot(ac, `bom dia, nível ${Math.round(alt / 100)}, chegada ${starId}${emg}`, 0.3);
    if (ac.emergency) { UI.flashBanner('EMERGÊNCIA: ' + ac.cs + ' solicita prioridade!', 'bad'); UI.chime(); }
  },

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
    ac.rwy = DATA.CONFIGS[this.cfg].depRwy;
    ac.clrAlt = 5000;
    this.aircraft.push(ac);
  },

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
    ac.crossRequested = false;
    ac.crossCleared = false;
    ac.zoneEntered = false;
    this.usedCs.add(cs);
    this.aircraft.push(ac);
    this.radioPilot(ac, `boa tarde, helicóptero ${type} VFR, ${Math.round(U.dist(0, 0, ex, ey))} milhas ao ` +
      `${this.cardinal(th + 180)}, ${U.fmtAlt(ac.alt)}, vamos cruzar a zona do aeródromo`, 0.4);
  },

  cardinal(brg) {
    const dirs = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
    return dirs[Math.round(U.norm360(brg) / 45) % 8];
  },

  onHeliCrossed(ac) {
    this.addScore(50, ac.cs + ' cruzou a zona coordenado');
    this.radioPilot(ac, 'cruzamento concluído, obrigado, bom serviço', 1);
  },

  // ---------- pista ----------
  runwayOccupied(rwy, except) {
    const pair = DATA.RWY_PAIR[rwy];
    return this.aircraft.some(a => a !== except && a.state !== 'done' &&
      ['lineup', 'takeoff', 'rollout', 'abort'].includes(a.state) && DATA.RWY_PAIR[a.rwy] === pair);
  },

  touchdown(ac) {
    ac.state = 'rollout';
    ac.rwy = ac.app.rwy;
    ac.hdg = DATA.RUNWAYS[ac.rwy].hdg;
    ac.alt = 0; ac.vs = 0;
    ac.timer = U.rnd(8, 14); // tempo para livrar após desacelerar
    ac.app = { phase: 'none', rwy: null };
    this.stats.landed++;
    let pts = 100;
    if (ac.emergency) { pts += 150; UI.logSys(ac.cs + ' (emergência) pousou em segurança — bônus!', 'good'); }
    this.addScore(pts, ac.cs + ' pousou pista ' + ac.rwy);
    this.radioPilot(ac, `pista livre em seguida, obrigado, bom serviço`, 2.5);
    UI.chime();
  },

  onGoAround(ac, reason) {
    this.stats.goarounds++;
    this.addScore(-100, ac.cs + ' arremeteu: ' + reason);
    this.radioPilot(ac, `arremetendo, ${reason}`, 0.4);
    UI.chime();
  },

  // executa uma instrução condicional que atingiu a condição (APOS)
  execPending(ac, p) {
    const { results } = Commands.run(ac, p.tokens, this);
    const rbs = results.filter(r => r && r.rb).map(r => r.rb);
    const errs = results.filter(r => r && r.err).map(r => r.err);
    if (rbs.length) this.radioPilot(ac, rbs.join(', '), 0.3);
    if (errs.length) this.radioPilot(ac, 'Não foi possível cumprir a condicional: ' + errs.join('; '), 0.3);
    UI.refreshSelPanel();
  },

  // ---------- comandos ----------
  runCommand(line) {
    const res = Commands.parse(line, this);
    if (!res) return;
    if (res.err) { UI.logSys(res.err, 'bad'); return; }
    const { ac, results, atcText } = res;
    if (atcText) UI.logATC(ac.cs + ', ' + atcText + '.');
    const rbs = [], errs = [];
    for (const r of results) {
      if (!r) continue;
      if (r.err) errs.push(r.err);
      else if (r.rb) rbs.push(r.rb);
    }
    if (rbs.length) this.radioPilot(ac, rbs.join(', '));
    if (errs.length) this.radioPilot(ac, 'Negativo, ' + errs.join('; '));
    if (results.some(r => r && r.early))
      UI.flashBanner('Cedo demais para transferir ' + ac.cs + ' — complete a SID e a subida (≥ 9.000 ft)', 'bad');
    this.select(this.selected === ac ? ac : this.selected); // refresh
    UI.refreshSelPanel();
  },

  // ---------- conflitos ----------
  checkConflicts(dt) {
    const air = this.aircraft.filter(a => a.airborne && a.alt > 400);
    for (const a of air) a.stca = 0;
    this.conflictPairs = [];
    let anyLoss = false;
    for (let i = 0; i < air.length; i++) for (let j = i + 1; j < air.length; j++) {
      const a = air[i], b = air[j];
      // aproximações paralelas estabelecidas em pistas distintas: separadas por procedimento
      const estA = a.app.phase === 'loc' || a.app.phase === 'gs';
      const estB = b.app.phase === 'loc' || b.app.phase === 'gs';
      if (estA && estB && a.app.rwy !== b.app.rwy) continue;

      const d = U.dist(a.x, a.y, b.x, b.y);
      const dz = Math.abs(a.alt - b.alt);
      const key = a.cs + '|' + b.cs;
      if (d < 3 && dz < 1000) {
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
        if (d > 5 || dz > 1400) this.sepPairs.delete(key);
        // previsão 60 s (linear)
        const t = 60 / 3600;
        const ax = a.x + Math.sin(U.d2r(a.hdg)) * a.spd * t, ay = a.y + Math.cos(U.d2r(a.hdg)) * a.spd * t;
        const bx = b.x + Math.sin(U.d2r(b.hdg)) * b.spd * t, by = b.y + Math.cos(U.d2r(b.hdg)) * b.spd * t;
        const df = U.dist(ax, ay, bx, by);
        const za = a.alt + a.vs, zb = b.alt + b.vs;
        if (Math.min(d, df) < 3.2 && (dz < 1000 || Math.abs(za - zb) < 1000)) {
          if (a.stca === 0) a.stca = 1;
          if (b.stca === 0) b.stca = 1;
          this.conflictPairs.push({ a, b, d, loss: false });
        }
      }
    }
    UI.setAlarm(anyLoss);
  },

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
        this.addScore(-150, ac.cs + ' saiu da TMA sem controle');
      }
    }
  },

  // ---------- loop ----------
  update(dt) {
    if (this.paused || !this.started) return;
    dt *= this.simSpeed;
    // subpassos para estabilidade em velocidade acelerada
    const steps = Math.max(1, Math.ceil(dt / 0.5));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.time += h;
      this.updateWeather(h);
      for (const ac of this.aircraft) ac.update(h, this);

      // rádio pendente
      for (let i = this.pendingRadio.length - 1; i >= 0; i--) {
        const m = this.pendingRadio[i];
        if (this.time >= m.at) {
          if (m.ac.state !== 'done' || m.ac.handedOff || m.ac.rwy) UI.logPilot(m.ac, m.text);
          this.pendingRadio.splice(i, 1);
        }
      }

      // spawns
      this.nextArr -= h; this.nextDep -= h; this.nextHeli -= h;
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
    if (this.selected && this.selected.state === 'done') this.select(null);
  },

  reset() {
    this.aircraft = [];
    this.selected = null;
    this.score = 0;
    this.time = 0;
    this.simSpeed = 1;
    this.paused = false;
    this.started = false;
    this.stats = { landed: 0, departed: 0, goarounds: 0, sepLoss: 0 };
    this.usedCs = new Set();
    this.pendingRadio = [];
    this.sepPairs = new Map();
    this.weather = null;
    this.atisIdx = 0;
    this.windEvent = null;
    UI.setAlarm(false);
    document.getElementById('log').innerHTML = '';
    document.getElementById('cmdInput').value = '';
    document.getElementById('pausedTag').classList.add('hidden');
    document.getElementById('btnPause').classList.remove('on');
    document.querySelectorAll('#speedBtns button').forEach(x => x.classList.toggle('on', x.dataset.s === '1'));
    UI.refreshStrips(); UI.refreshTop(); UI.refreshSelPanel();
    document.getElementById('startOverlay').classList.remove('hidden');
  },

  start(cfg, traffic) {
    this.cfg = cfg;
    this.traffic = traffic;
    this.initWeather();
    this.started = true;
    document.getElementById('startOverlay').classList.add('hidden');
    document.getElementById('cfgLabel').textContent =
      DATA.AIRPORT.icao + ' ' + DATA.AIRPORT.name + ' · ' + DATA.CONFIGS[cfg].label;
    UI.logSys('Posição assumida. ' + DATA.CONFIGS[cfg].label + '. Vento ' + this.windStr() + '. Bom serviço!');
    // tráfego inicial
    this.spawnArrival();
    this.nextArr = U.rnd(20, 35);
    this.nextDep = U.rnd(8, 15);
    this.nextHeli = U.rnd(120, 260);
    this.spawnDeparture();
    if (!UI.isTouch) document.getElementById('cmdInput').focus();
  },
};

// ---------------- bootstrap ----------------
window.addEventListener('DOMContentLoaded', async () => {
  game.loadPrefs();
  const cv = document.getElementById('radar');
  Radar.init(cv, game);
  UI.init(game);

  // recorde local (localStorage)
  const rec = game.record();
  if (rec) document.getElementById('recordLine').textContent =
    `🏆 Recorde local: ${rec.score} pts (${rec.landed} pousos, ${rec.departed} saídas — ${rec.date})`;

  // tela inicial
  let selCfg = null, selTraffic = 'normal';

  function buildCfgButtons() {
    const box = document.getElementById('cfgPick');
    box.innerHTML = '';
    const keys = Object.keys(DATA.CONFIGS);
    selCfg = keys.includes(DATA.AIRPORT.defaultCfg) ? DATA.AIRPORT.defaultCfg : (keys[0] || null);
    keys.forEach(k => {
      const c = DATA.CONFIGS[k];
      const b = document.createElement('button');
      b.textContent = c.btn || c.label || k;
      b.classList.toggle('on', k === selCfg);
      b.onclick = () => {
        selCfg = k;
        box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      };
      box.appendChild(b);
    });
  }

  async function selectAirport(entry, btn) {
    document.querySelectorAll('#airportPick button').forEach(x => x.classList.toggle('on', x === btn));
    await DATA.loadAirport(entry.file);
    document.querySelector('.startCard .sub').textContent =
      `Aeroporto ${DATA.AIRPORT.name} (${DATA.AIRPORT.icao}) — Controle de Aproximação e Torre`;
    buildCfgButtons();
    Radar.fitView();
  }

  try {
    const manifest = await DATA.loadManifest();
    const box = document.getElementById('airportPick');
    box.innerHTML = '';
    manifest.forEach((m, i) => {
      const b = document.createElement('button');
      b.textContent = m.title;
      b.title = m.desc || '';
      b.onclick = () => selectAirport(m, b).catch(e => UI.logSys('Erro ao carregar aeroporto: ' + e.message, 'bad'));
      if (i === 0) b.classList.add('on');
      box.appendChild(b);
    });
    if (manifest.length) await DATA.loadAirport(manifest[0].file);
    buildCfgButtons();
  } catch (e) {
    document.querySelector('.startCard .sub').textContent =
      'ERRO ao carregar dados: ' + e.message + ' — o jogo precisa ser servido por HTTP (ex.: python -m http.server)';
  }

  document.querySelectorAll('#trafficPick button').forEach(b => b.onclick = () => {
    selTraffic = b.dataset.t;
    document.querySelectorAll('#trafficPick button').forEach(x => x.classList.toggle('on', x === b));
  });
  document.getElementById('btnStart').onclick = () => {
    if (!selCfg) return;
    game.start(selCfg, selTraffic);
    Radar.fitView();
  };
  document.getElementById('btnStartCharts').onclick = () => UI.openCharts();

  // menu de reinício
  document.getElementById('btnRestart').onclick = () => {
    if (game.started) document.getElementById('restartModal').classList.remove('hidden');
  };
  document.getElementById('btnRestartYes').onclick = () => {
    document.getElementById('restartModal').classList.add('hidden');
    game.reset();
  };
  document.getElementById('btnRestartNo').onclick = () =>
    document.getElementById('restartModal').classList.add('hidden');

  // loop de render/simulação
  let last = performance.now();
  let uiT = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.update(dt);
    Radar.draw(dt);
    uiT += dt;
    if (uiT > 0.4) { uiT = 0; UI.refreshStrips(); UI.refreshTop(); UI.refreshSelPanel(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
