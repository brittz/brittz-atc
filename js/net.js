// ============================================================
// Net — cliente WebSocket do multiplayer (§3 e §6 do contrato)
// Mantém espelhos do estado remoto (score/stats/time/weather/atis/cfg),
// hidrata os snapshots em instâncias REAIS de Aircraft (radar/ui/strips
// funcionam sem mudanças) e faz dead reckoning entre snapshots rodando
// ac.update(dt, fakeCore) — o snapshot seguinte corrige.
// Sem dependência de DOM no carregamento (testável em Node com require).
// ============================================================
'use strict';

// Compatibilidade dual: em Node (testes) importa a classe Aircraft se ainda
// não estiver publicada em globalThis (engine/core.js normalmente já publicou).
if (typeof require !== 'undefined' && typeof module !== 'undefined' &&
    typeof Aircraft === 'undefined') {
  globalThis.Aircraft = require('../engine/aircraft.js').Aircraft;
}
if (typeof require !== 'undefined' && typeof module !== 'undefined' &&
    typeof Emergency === 'undefined') {
  globalThis.Emergency = require('../engine/emergency.js').Emergency;
}

const Net = {
  // ---------- estado ----------
  ws: null,
  connected: false,      // socket aberto
  active: false,         // sessão INICIADA (em jogo multiplayer)
  session: null,         // última mensagem {t:'session', ...}
  nick: null,
  aircraft: [],          // instâncias de Aircraft hidratadas dos snapshots

  // espelhos do servidor (atualizados a cada snap)
  score: 0,
  stats: { landed: 0, departed: 0, goarounds: 0, sepLoss: 0 },
  time: 0,
  weather: null,         // {dir, spd, qnh, temp}
  atis: 'A',
  cfg: null,
  runwayUse: null,       // uso das pistas do fluxo (pouso/dec/ambas), do snapshot
  airportState: { state: 'normal', label: 'Normal', active: [] },
  runwayStates: {},
  emergencyUnits: [],
  emergencyResponse: null,

  // hooks preenchidos pelo cliente (js/main.js)
  onSession: null,       // (msg) => atualiza o lobby
  onError: null,         // (texto) => feedback na tela inicial/lobby

  _afterHello: null,     // ação pendente após o hello-ok (create/join)

  // "core" falso para o dead reckoning: as aeronaves chamam estes métodos
  // durante o update; entre snapshots todos os efeitos são descartados
  // (o servidor é a autoridade — o próximo snap corrige qualquer desvio).
  _fake: {
    radioPilot() {}, execPending() {}, touchdown() {}, onGoAround() {},
    onHeliCrossed() {}, completeHandoff() {}, addScore() {},
    runwayOccupied: () => false, windStr: () => '', clock: () => '',
  },

  // ---------- conexão ----------
  connect(onReady, onFail) {
    if (this.ws && this.ws.readyState === 1) { onReady && onReady(); return; }
    const url = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/ws';
    let opened = false;
    let ws;
    try { ws = new WebSocket(url); }
    catch (e) { onFail && onFail(); return; }
    this.ws = ws;
    ws.onopen = () => { opened = true; this.connected = true; onReady && onReady(); };
    ws.onmessage = e => {
      let m = null;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m && m.t) this._onMessage(m);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      if (!opened) { onFail && onFail(); return; }
      this._onDisconnect();
    };
  },

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  },

  // ---------- API (cliente → servidor, §3) ----------
  hello(nick) { this.nick = nick; this.send({ t: 'hello', nick }); },
  create(cfg, traffic) { this.send({ t: 'create', cfg, traffic }); },
  join(code) { this.send({ t: 'join', code: String(code || '').toUpperCase() }); },
  setPosition(pos) { this.send({ t: 'position', pos }); },
  start() { this.send({ t: 'start' }); },
  sendCmd(line) { this.send({ t: 'cmd', line }); },
  sendChat(text, to) {
    const m = { t: 'chat', text };
    if (to) m.to = to;
    this.send(m);
  },
  leave() {
    if (this.ws) {
      try { this.send({ t: 'leave' }); } catch (e) {}
      const ws = this.ws;
      this.ws = null;
      try { ws.onclose = null; ws.close(); } catch (e) {}
    }
    this.connected = false;
    this.active = false;
    this.session = null;
    this.aircraft = [];
    this.runwayUse = null;
    this.airportState = { state: 'normal', label: 'Normal', active: [] };
    this.runwayStates = {};
    this.emergencyUnits = [];
    this.emergencyResponse = null;
    this._afterHello = null;
    if (typeof document !== 'undefined') {
      const lm = document.getElementById('lobbyModal');
      if (lm) lm.classList.add('hidden');
      this._restoreUi();
    }
  },

  // restaura a dica/placeholder da barra de comando ao sair do multiplayer
  _restoreUi() {
    if (!this._uiPrev || typeof document === 'undefined') return;
    const hint = document.getElementById('cmdHint');
    const inp = document.getElementById('cmdInput');
    if (hint && this._uiPrev.hint != null) hint.textContent = this._uiPrev.hint;
    if (inp && this._uiPrev.ph != null) inp.placeholder = this._uiPrev.ph;
    this._uiPrev = null;
  },

  // ---------- hidratação do snapshot (§5) ----------
  // Reutiliza a instância existente pelo callsign (Object.assign) para
  // PRESERVAR a referência de objeto (game.selected aponta para ela);
  // cria instâncias novas para quem entrou e remove quem saiu do snap.
  hydrate(list) {
    const seen = new Set();
    for (const d of list) {
      seen.add(d.cs);
      let ac = this.aircraft.find(a => a.cs === d.cs);
      if (!ac) {
        ac = new Aircraft({ cs: d.cs, type: d.type, kind: d.kind, x: d.x, y: d.y });
        this.aircraft.push(ac);
      }
      if (d.emergency) d.emergency = Emergency.hydrate(d.emergency);
      // `pending` vem só com labels — fica como está para o painel (⏳)
      Object.assign(ac, d);
    }
    for (let i = this.aircraft.length - 1; i >= 0; i--)
      if (!seen.has(this.aircraft[i].cs)) this.aircraft.splice(i, 1);
  },

  // ---------- dead reckoning entre snapshots ----------
  tick(dt) {
    this.time += dt; // o relógio anda suave; o snap corrige
    for (const ac of this.aircraft) {
      if (ac.state !== 'air') continue;
      try { ac.update(dt, this._fake); } catch (e) { /* o próximo snap corrige */ }
    }
  },

  // ---------- recepção (servidor → cliente, §3) ----------
  _onMessage(msg) {
    switch (msg.t) {
      case 'hello-ok': {
        this.nick = msg.nick || this.nick;
        const f = this._afterHello;
        this._afterHello = null;
        if (f) f();
        break;
      }

      case 'session':
        this.session = msg;
        if (msg.cfg) this.cfg = msg.cfg;
        if (this.onSession) this.onSession(msg);
        break;

      case 'start': {
        DATA.setAirport(msg.airport);
        this.cfg = msg.cfg || this.cfg;
        this.time = msg.time || 0;
        this.aircraft = [];
        this.active = true;
        if (typeof document !== 'undefined') {
          const lm = document.getElementById('lobbyModal');
          if (lm) lm.classList.add('hidden');
          const so = document.getElementById('startOverlay');
          if (so) so.classList.add('hidden');
          const lbl = document.getElementById('cfgLabel');
          const c = DATA.CONFIGS[this.cfg];
          if (lbl) lbl.textContent = DATA.AIRPORT.icao + ' ' + DATA.AIRPORT.name +
            ' · ' + (c ? c.label : this.cfg) +
            (this.session ? ' · MP ' + this.session.code : '');
          // dica de chat na barra de comando (restaurada no leave)
          const hint = document.getElementById('cmdHint');
          const inp = document.getElementById('cmdInput');
          if (!this._uiPrev) this._uiPrev = {
            hint: hint ? hint.textContent : null,
            ph: inp ? inp.placeholder : null,
          };
          if (hint) hint.textContent = this._uiPrev.hint + ' · /c chat · /w nick privado';
          if (inp) inp.placeholder = 'Ex.: TAM3412 A 6000 · ILS 09L · /c mensagem · /w nick privado';
        }
        Radar.fitView();
        UI.logSys('Sessão multiplayer iniciada — bom serviço!', 'good');
        UI.logSys('Chat da sessão: /c mensagem · privado: /w nick mensagem');
        break;
      }

      case 'snap':
        this.time = msg.time;
        this.score = msg.score;
        if (msg.stats) this.stats = msg.stats;
        if (msg.weather) this.weather = msg.weather;
        if (msg.atis) this.atis = msg.atis;
        if (msg.cfg) this.cfg = msg.cfg;
        if (msg.runwayUse) this.runwayUse = msg.runwayUse;
        if (msg.airportState) this.airportState = msg.airportState;
        if (msg.runwayStates) this.runwayStates = msg.runwayStates;
        if (msg.emergencyUnits) this.emergencyUnits = msg.emergencyUnits;
        else if (msg.emergencyResponse && msg.emergencyResponse.units)
          this.emergencyUnits = msg.emergencyResponse.units;
        if (msg.emergencyResponse) this.emergencyResponse = msg.emergencyResponse;
        this.hydrate(msg.aircraft || []);
        break;

      case 'radio':
        if (msg.who === 'atc') UI.logATC(msg.text, { cs: msg.cs, radio: msg.radio });
        else if (msg.who === 'pilot') {
          const ac = this.aircraft.find(a => a.cs === msg.cs);
          if (ac) UI.logPilot(ac, msg.text);
          // aeronave ainda não veio num snapshot (ex.: check-in): piloto "provisório"
          else if (msg.cs) UI.logPilot({ cs: msg.cs, radio: msg.radio || msg.cs, emergency: false }, msg.text);
          else UI.logSys(msg.text, msg.cls || '');
        } else UI.logSys(msg.text, msg.cls || '');
        break;

      case 'chat':
        UI.logChat(msg.from, msg.text, !!msg.to);
        break;

      case 'event':
        if (msg.kind === 'banner') UI.flashBanner(msg.text, msg.cls || '');
        else if (msg.kind === 'chime') UI.chime();
        else if (msg.kind === 'alarm') UI.setAlarm(!!msg.on);
        break;

      case 'error':
        UI.logSys(msg.msg, 'bad');
        if (!this.active && this.onError) this.onError(msg.msg);
        break;
    }
  },

  // desconexão inesperada (o socket caiu depois de aberto)
  _onDisconnect() {
    const wasActive = this.active;
    const wasLobby = !!this.session && !this.active;
    this.active = false;
    this.session = null;
    this.aircraft = [];
    this.runwayUse = null;
    this.airportState = { state: 'normal', label: 'Normal', active: [] };
    this.runwayStates = {};
    this.emergencyUnits = [];
    this.emergencyResponse = null;
    this._afterHello = null;
    if (typeof document !== 'undefined') {
      const lm = document.getElementById('lobbyModal');
      if (lm) lm.classList.add('hidden');
    }
    if (wasActive) {
      UI.flashBanner('Conexão perdida', 'bad');
      game.reset(); // volta ao menu
    } else if (wasLobby) {
      UI.logSys('Conexão com o servidor perdida.', 'bad');
      if (this.onError) this.onError('Conexão com o servidor perdida.');
    }
  },
};

if (typeof module !== 'undefined') module.exports = { Net };
