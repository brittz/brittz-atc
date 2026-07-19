// ============================================================
// Adaptador single-player: liga o GameCore (motor) ao DOM/UI.
// A simulação vive no core (engine/core.js); aqui ficam seleção, pausa,
// velocidade, localStorage, bootstrap e a facade `game` que radar.js/ui.js
// já consomem (mesmos nomes de sempre, agora delegando ao core).
// ============================================================
'use strict';

let core = null;             // instância de GameCore da partida atual
let airportJson = null;      // JSON do aeroporto carregado (p/ criar o core)

async function loadVersionInfo() {
  const res = await fetch('version.md', { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ao carregar version.md');
  const text = await res.text();
  // Aceita em-dash (—) ou hífen (-) entre versão e data (publish agents às vezes usam "-")
  const m = text.match(/^## \[([^\]]+)\]\s+[—\-]\s+(\d{4}-\d{2}-\d{2})$/m);
  if (!m) throw new Error('version.md sem cabeçalho de versão válido');
  return {
    number: m[1],
    date: m[2],
    label: 'v' + m[1],
    fullLabel: 'Versão ' + m[1] + ' — ' + m[2],
    markdown: text,
  };
}

// traduz os eventos do core em efeitos de UI (o que antes eram chamadas UI.* diretas)
function handleEmit(ev) {
  switch (ev.type) {
    case 'radio':
      if (ev.who === 'atc') UI.logATC(ev.text, { cs: ev.cs, radio: ev.radio || (ev.ac && ev.ac.radio) });
      else if (ev.who === 'pilot') UI.logPilot(ev.ac, ev.text);
      else UI.logSys(ev.text, ev.cls || '');
      break;
    case 'score':
      UI.logSys((ev.delta >= 0 ? '+' : '') + ev.delta + ' pts — ' + ev.why, ev.delta >= 0 ? 'good' : 'bad');
      if (ev.delta < 0) UI.flashBanner(ev.why + ' (' + ev.delta + ' pts)', 'bad');
      if (ev.delta > 0) game.saveRecordIfBest();
      break;
    case 'banner': UI.flashBanner(ev.text, ev.cls || ''); break;
    case 'chime': UI.chime(); break;
    case 'alarm': UI.setAlarm(ev.on); break;
    case 'atis':
      UI.logSys('Informação ATIS ' + ev.letter + ' disponível' + (ev.extra ? ' — ' + ev.extra : '') + ': ' + ev.metar);
      break;
    case 'config':
      document.getElementById('cfgLabel').textContent = ev.label;
      break;
  }
}

const game = {
  // ---------- estado do CLIENTE (fora do core) ----------
  selected: null,
  _simSpeed: 1,
  paused: false,
  settings: {
    sound: true, tts: true, sweep: true, fixNames: true, trailLine: false,
    historicalAirlines: false,
  },
  airportJson: null,
  versionInfo: { number: '—', date: '', label: 'v—', fullLabel: 'Versão —' },

  /** Aplica o pool de companhias (AirlineService → DATA.AIRLINES). */
  applyAirlines() {
    if (typeof AirlineService === 'undefined' || !AirlineService.isLoaded()) return;
    AirlineService.applyToData(!!this.settings.historicalAirlines);
  },

  // velocidade de simulação: no multiplayer o tempo é do servidor
  get simSpeed() { return this._simSpeed; },
  set simSpeed(v) {
    if (Net.active) { UI.logSys('Tempo controlado pelo servidor no multiplayer'); return; }
    this._simSpeed = v;
  },

  // ---------- espelhos do core (só leitura) — no MP, espelhos do Net ----------
  get aircraft() { return Net.active ? Net.aircraft : (core ? core.aircraft : []); },
  get started() { return Net.active ? true : (core ? core.started : false); },
  get cfg() { return Net.active ? (Net.cfg || '09') : (core ? core.cfg : '09'); },
  get score() { return Net.active ? Net.score : (core ? core.score : 0); },
  get stats() { return Net.active ? Net.stats : (core ? core.stats : { landed: 0, departed: 0, goarounds: 0, sepLoss: 0 }); },
  get time() { return Net.active ? Net.time : (core ? core.time : 0); },
  get conflictPairs() { return Net.active ? [] : (core ? core.conflictPairs : []); },
  get airportState() {
    return Net.active
      ? (Net.airportState || { state: 'normal', label: 'Normal', active: [] })
      : (core ? core.airportState : { state: 'normal', label: 'Normal', active: [] });
  },
  get emergencyUnits() {
    if (Net.active) return Net.emergencyUnits || [];
    return (core && core.emergencyResponse && core.emergencyResponse.units) || [];
  },
  get runwayStates() {
    if (Net.active) return Net.runwayStates || {};
    return (core && core.runwayMgr && typeof RunwayState !== 'undefined')
      ? RunwayState.serialize(core.runwayMgr) : {};
  },
  get emergencyResponse() {
    if (Net.active) return Net.emergencyResponse || null;
    return core ? core.emergencyResponse : null;
  },
  dispatchEmergency(ac, kind) {
    if (Net.active) return { err: 'despacho via comando de rádio no multiplayer' };
    return core ? core.dispatchEmergency(ac, kind) : { err: 'jogo não iniciado' };
  },
  endEmergencyResponse(ac, force) {
    if (Net.active) return { err: 'encerramento via comando de rádio no multiplayer' };
    return core ? core.endEmergencyResponse(ac, force) : { err: 'jogo não iniciado' };
  },

  clock() {
    if (Net.active) { // mesmo relógio do core: turno começa 13:20:00Z
      const base = 13 * 3600 + 20 * 60;
      const t = base + Math.floor(Net.time);
      const h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60, s = t % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return core ? core.clock() : '13:20:00';
  },
  windStr() {
    if (Net.active) {
      const w = Net.weather;
      if (!w || w.dir == null) return '—';
      return `${U.fmtHdg(w.dir)}°/${Math.round(w.spd)}kt`;
    }
    return core ? core.windStr() : '—';
  },
  metar() {
    if (Net.active) { // mesmo formato do core, a partir dos espelhos
      const w = Net.weather;
      if (!w || w.dir == null) return '—';
      const hhmm = this.clock().slice(0, 5).replace(':', '');
      let ddd = Math.round(w.dir / 10) * 10;
      if (ddd === 0) ddd = 360;
      const dew = w.temp - 7;
      return `METAR ${DATA.AIRPORT.icao} 14${hhmm}Z ${String(ddd).padStart(3, '0')}${String(Math.round(w.spd)).padStart(2, '0')}KT 9999 FEW025 SCT080 ${w.temp}/${dew} Q${w.qnh}`;
    }
    return core ? core.metar() : '—';
  },
  atisLetter() { return Net.active ? Net.atis : (core ? core.atisLetter() : 'A'); },
  tailwind(k) {
    if (Net.active) {
      const w = Net.weather, cfg = DATA.CONFIGS[k || this.cfg];
      if (!w || w.dir == null || !cfg) return 0;
      const r = DATA.RUNWAYS[cfg.arrRwy];
      return -w.spd * Math.cos(U.d2r(w.dir - r.hdg));
    }
    return core ? core.tailwind(k) : 0;
  },
  setConfig(k) {
    if (Net.active) { UI.logSys('Troca de pistas em uso disponível apenas no single-player'); return; }
    if (core) core.setConfig(k);
  },

  // ---------- uso das pistas do fluxo (pouso / decolagem / ambas) ----------
  cfgRunways() {
    const c = DATA.CONFIGS[this.cfg];
    if (!c) return [];
    return c.runways || [...new Set([c.arrRwy, c.depRwy])];
  },
  get runwayUse() {
    if (Net.active) return Net.runwayUse || {};
    return core ? core.runwayUse : {};
  },
  arrRwys() {
    if (core && !Net.active) return core.arrRwys();
    const u = this.runwayUse;
    return this.cfgRunways().filter(r => u[r] !== 'dec');
  },
  depRwys() {
    if (core && !Net.active) return core.depRwys();
    const u = this.runwayUse;
    return this.cfgRunways().filter(r => u[r] !== 'pouso');
  },
  setRunwayUse(rwy, use) {
    if (Net.active) { UI.logSys('Uso de pistas ajustável apenas no single-player (por enquanto)'); return; }
    if (!core) return;
    const r = core.setRunwayUse(rwy, use);
    if (r && r.err) UI.logSys(r.err, 'bad');
  },

  rank() {
    const s = this.score;
    if (s < 300) return 'Estagiário';
    if (s < 800) return 'Controlador Jr.';
    if (s < 1600) return 'Controlador';
    if (s < 3000) return 'Controlador Sênior';
    return 'Supervisor de TMA';
  },

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

  // ---------- seleção / pausa / velocidade (cliente) ----------
  select(a) {
    this.selected = a;
    if (core) core.selected = a; // contexto para runCommand (omitir callsign)
    // preenche o indicativo pela ação reutilizável (preserva edição do mesmo
    // indicativo; no toque não abre o teclado)
    if (a) UI.insertCallsign(a.cs);
    UI.refreshSelPanel();
    UI.refreshStrips();
  },

  togglePause() {
    if (Net.active) { UI.logSys('Tempo controlado pelo servidor no multiplayer'); return; }
    this.paused = !this.paused;
    document.getElementById('btnPause').classList.toggle('on', this.paused);
    document.getElementById('pausedTag').classList.toggle('hidden', !this.paused);
  },

  // ---------- comandos ----------
  runCommand(line) {
    if (Net.active) {
      const l = line.trim();
      // chat pela caixa de comando: /c texto (sessão) · /w nick texto (privado)
      if (/^\/c\s+/i.test(l)) { Net.sendChat(l.replace(/^\/c\s+/i, '')); return; }
      if (/^\/w\s+/i.test(l)) {
        const rest = l.replace(/^\/w\s+/i, '');
        const sp = rest.indexOf(' ');
        if (sp < 0) { UI.logSys('Uso: /w nick mensagem', 'bad'); return; }
        Net.sendChat(rest.slice(sp + 1).trim(), rest.slice(0, sp));
        return;
      }
      Net.sendCmd(line);
      return;
    }
    if (!core) return;
    const res = core.runCommand(line);
    if (res && res.early && res.cs)
      UI.flashBanner('Cedo demais para transferir ' + res.cs + ' — complete a SID e a subida (≥ 9.000 ft)', 'bad');
    this.select(this.selected); // refresh do painel/seleção
    UI.refreshSelPanel();
  },

  // ---------- laço do cliente ----------
  update(dt) {
    if (Net.active) { // multiplayer: sem pausa nem velocidade — o servidor manda
      Net.tick(dt);
      if (this.selected && (this.selected.state === 'done' || !Net.aircraft.includes(this.selected)))
        this.select(null);
      return;
    }
    if (!core || !core.started || this.paused) return;
    core.tick(dt * this.simSpeed);
    if (this.selected && this.selected.state === 'done') this.select(null);
  },

  // ---------- ciclo de vida da partida ----------
  start(cfg, traffic) {
    this.applyAirlines();
    core = new GameCore(this.airportJson, { cfg, traffic, emit: handleEmit });
    core.selected = this.selected;
    this.simSpeed = 1;
    this.paused = false;
    document.getElementById('startOverlay').classList.add('hidden');
    document.getElementById('cfgLabel').textContent =
      DATA.AIRPORT.icao + ' ' + DATA.AIRPORT.name + ' · ' + DATA.CONFIGS[cfg].label;
    if (!UI.isTouch) document.getElementById('cmdInput').focus();
  },

  reset() {
    if (Net.session || Net.active || Net.connected) Net.leave(); // sai da sessão MP
    core = null;
    this.selected = null;
    this.simSpeed = 1;
    this.paused = false;
    UI.setAlarm(false);
    document.getElementById('log').innerHTML = '';
    document.getElementById('cmdInput').value = '';
    document.getElementById('pausedTag').classList.add('hidden');
    document.getElementById('btnPause').classList.remove('on');
    document.querySelectorAll('#speedBtns button').forEach(x => x.classList.toggle('on', x.dataset.s === '1'));
    UI.refreshStrips(); UI.refreshTop(); UI.refreshSelPanel();
    document.getElementById('startOverlay').classList.remove('hidden');
  },
};

// ---------------- bootstrap ----------------
window.addEventListener('DOMContentLoaded', async () => {
  game.loadPrefs();
  const cv = document.getElementById('radar');
  Radar.init(cv, game);
  UI.init(game);
  try {
    await AirlineService.load('data/airlines.json');
    game.applyAirlines();
  } catch (e) {
    console.error('Falha ao carregar companhias:', e);
    UI.logSys('Não foi possível carregar data/airlines.json: ' + e.message, 'bad');
  }
  try {
    game.versionInfo = await loadVersionInfo();
  } catch (e) {
    game.versionInfo = {
      number: 'indisponível',
      date: '',
      label: 'v?',
      fullLabel: 'Versão indisponível',
      markdown: '',
    };
    console.error('Falha ao carregar version.md:', e);
    UI.logSys('Não foi possível carregar version.md: ' + e.message, 'bad');
  }
  UI.refreshTop();

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
    game.airportJson = await DATA.loadAirport(entry.file);
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
    if (manifest.length) game.airportJson = await DATA.loadAirport(manifest[0].file);
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

  // ---------------- multiplayer (lobby + sessão) ----------------
  const $id = id => document.getElementById(id);
  const mpMsg = t => { $id('mpMsg').textContent = t || ''; };
  Net.onError = t => mpMsg(t);

  // conecta (se preciso), faz o hello e então executa a ação (create/join)
  function mpGo(then) {
    const nick = $id('mpNick').value.trim();
    if (!nick) { mpMsg('Informe um indicativo (nick) para jogar em rede.'); return; }
    try { localStorage.setItem('atcv-nick', nick); } catch (e) {}
    mpMsg('Conectando ao servidor…');
    Net.connect(
      () => { Net._afterHello = then; Net.hello(nick); },
      () => mpMsg('Sem servidor multiplayer — sirva o jogo com "cd server && node index.js" e abra por lá.'));
  }
  try { $id('mpNick').value = localStorage.getItem('atcv-nick') || ''; } catch (e) {}
  $id('mpCreate').onclick = () => mpGo(() =>
    Net.create(selCfg, selTraffic, !!game.settings.historicalAirlines));
  $id('mpJoin').onclick = () => {
    const code = $id('mpCode').value.trim().toUpperCase();
    if (!/^[A-Z]{5}$/.test(code)) { mpMsg('Código da sessão: 5 letras (ex.: KDQXZ).'); return; }
    mpGo(() => Net.join(code));
  };
  $id('mpCode').addEventListener('keydown', e => { if (e.key === 'Enter') $id('mpJoin').onclick(); });

  // lobby: atualizado a cada mensagem 'session'
  Net.onSession = s => {
    mpMsg('');
    if (Net.active) return; // em jogo: não reabrir o lobby (jogador entrou/saiu)
    $id('lobbyModal').classList.remove('hidden');
    $id('lobbyCode').textContent = s.code;
    const me = (s.players || []).find(p => p.nick === Net.nick);
    const box = $id('lobbyPlayers');
    box.innerHTML = '';
    for (const p of (s.players || [])) {
      const el = document.createElement('div');
      el.className = 'lp';
      const host = p.nick === s.host ? '<span class="host" title="Host">★</span> ' : '';
      const nk = document.createElement('span');
      nk.textContent = p.nick + (p.nick === Net.nick ? ' (você)' : '');
      el.innerHTML = host;
      el.appendChild(nk);
      const pos = document.createElement('span');
      pos.className = 'pos';
      pos.textContent = p.pos || 'OBS';
      el.appendChild(pos);
      box.appendChild(el);
    }
    document.querySelectorAll('#lobbyPos button').forEach(b =>
      b.classList.toggle('on', !!me && me.pos === b.dataset.pos));
    $id('lobbyStart').classList.toggle('hidden', s.host !== Net.nick);
  };
  document.querySelectorAll('#lobbyPos button').forEach(b =>
    b.onclick = () => Net.setPosition(b.dataset.pos));
  $id('lobbyStart').onclick = () => Net.start();
  // fechar o lobby (✕ ou clique fora) = sair da sessão
  $id('lobbyModal').querySelector('.close').onclick = () => Net.leave();
  $id('lobbyModal').addEventListener('click', e => { if (e.target === $id('lobbyModal')) Net.leave(); });

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
