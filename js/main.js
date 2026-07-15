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
  settings: { sound: true, tts: true, sweep: true, fixNames: true },
  stats: { landed: 0, departed: 0, goarounds: 0, sepLoss: 0 },
  usedCs: new Set(),
  nextArr: 10, nextDep: 20,
  pendingRadio: [],    // mensagens de piloto com atraso
  sepPairs: new Set(), // pares já penalizados nesta perda

  // ---------- utilidades ----------
  clock() {
    const base = 13 * 3600 + 20 * 60; // 13:20Z início do turno
    const t = base + Math.floor(this.time);
    const h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60, s = t % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  },
  windStr() {
    const w = DATA.CONFIGS[this.cfg].wind;
    return `${U.fmtHdg(w.dir)}°/${w.spd}kt`;
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

  // ---------- pista ----------
  runwayOccupied(rwy, except) {
    const pair = DATA.RWY_PAIR[rwy];
    return this.aircraft.some(a => a !== except && a.state !== 'done' &&
      ['lineup', 'takeoff', 'rollout'].includes(a.state) && DATA.RWY_PAIR[a.rwy] === pair);
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
    this.select(this.selected === ac ? ac : this.selected); // refresh
    UI.refreshSelPanel();
  },

  // ---------- conflitos ----------
  checkConflicts() {
    const air = this.aircraft.filter(a => a.airborne && a.alt > 400);
    for (const a of air) a.stca = 0;
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
        if (!this.sepPairs.has(key)) {
          this.sepPairs.add(key);
          this.stats.sepLoss++;
          this.addScore(-200, 'PERDA DE SEPARAÇÃO: ' + a.cs + ' × ' + b.cs);
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
          ac.state = 'done'; ac.handedOff = true;
          this.stats.departed++;
          if (ac.alt >= 9500) this.addScore(100, ac.cs + ' transferido ao Centro no nível');
          else this.addScore(40, ac.cs + ' transferido baixo (subida tardia)');
          this.radioPilot(ac, 'chamando o Centro, obrigado, até logo', 0.3);
        }
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
      this.nextArr -= h; this.nextDep -= h;
      const [ra, rd] = this.trafficRates();
      const arrCount = this.aircraft.filter(a => a.kind === 'arr' && a.state !== 'done').length;
      const depCount = this.aircraft.filter(a => a.kind === 'dep' && a.state !== 'done').length;
      if (this.nextArr <= 0) { if (arrCount < 9) this.spawnArrival(); this.nextArr = U.rnd(ra * 0.7, ra * 1.3); }
      if (this.nextDep <= 0) { if (depCount < 7) this.spawnDeparture(); this.nextDep = U.rnd(rd * 0.7, rd * 1.3); }
    }

    this.checkConflicts();
    this.checkBoundaries();
    this.aircraft = this.aircraft.filter(a => a.state !== 'done');
    if (this.selected && this.selected.state === 'done') this.select(null);
  },

  start(cfg, traffic) {
    this.cfg = cfg;
    this.traffic = traffic;
    this.started = true;
    document.getElementById('startOverlay').classList.add('hidden');
    document.getElementById('cfgLabel').textContent = DATA.CONFIGS[cfg].label;
    UI.logSys('Posição assumida. ' + DATA.CONFIGS[cfg].label + '. Vento ' + this.windStr() + '. Bom serviço!');
    // tráfego inicial
    this.spawnArrival();
    this.nextArr = U.rnd(20, 35);
    this.nextDep = U.rnd(8, 15);
    this.spawnDeparture();
    document.getElementById('cmdInput').focus();
  },
};

// ---------------- bootstrap ----------------
window.addEventListener('DOMContentLoaded', () => {
  const cv = document.getElementById('radar');
  Radar.init(cv, game);
  UI.init(game);

  // tela inicial
  let selCfg = '09', selTraffic = 'normal';
  document.querySelectorAll('#cfgPick button').forEach(b => b.onclick = () => {
    selCfg = b.dataset.cfg;
    document.querySelectorAll('#cfgPick button').forEach(x => x.classList.toggle('on', x === b));
  });
  document.querySelectorAll('#trafficPick button').forEach(b => b.onclick = () => {
    selTraffic = b.dataset.t;
    document.querySelectorAll('#trafficPick button').forEach(x => x.classList.toggle('on', x === b));
  });
  document.getElementById('btnStart').onclick = () => { game.start(selCfg, selTraffic); Radar.fitView(); };
  document.getElementById('btnStartCharts').onclick = () => UI.openCharts();

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
