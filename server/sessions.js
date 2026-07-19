// ============================================================
// server/sessions.js — gerência de sessões/posições/chat (§3, §4, §7)
// SessionManager cria/junta sessões; cada Session dona de um GameCore e do
// laço de tick/snapshot em tempo real (sem aceleração no MP).
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { GameCore } = require('../engine/core.js');
const { AirlineService } = require('../js/airline_service.js');

if (!AirlineService.isLoaded()) AirlineService.loadSync();

// comandos de autoridade da TWR (§4) — tudo que não estiver aqui é APP
const TWR_CMDS = new Set([
  'ALINHAR', 'LU',
  'DEC', 'TO', 'CTO', 'DECOLAR', 'TAKEOFF', 'TKFF', 'TKOF',
  'AP', 'POUSO', 'CTL',
  'ABORTAR', 'ABT', 'RTO', 'REJECT',
  'LIVRAR', 'VACATE',
  'TAXI', 'TAXIAR',
  'CRZ', 'CRUZAR', 'CROSS', 'CRUZAMENTO',
  'ARR', 'GA', 'ARREMETER',
  'DISPATCH_FIRE', 'DISPATCH_AMBULANCE', 'DISPATCH_MEDICAL', 'DISPATCH_FULL',
  'END_EMERGENCY',
]);

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TICK_MS = 250;               // 250 ms de simulação real (sem aceleração no MP)
const TICK_DT = TICK_MS / 1000;
const SESSION_EMPTY_TTL_MS = 60 * 1000; // sessão sem jogadores morre em 60s
const CHAT_MAX_MSGS = 5;
const CHAT_WINDOW_MS = 5000;

function randCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

class Session {
  constructor(code, hostNick, cfg, traffic, store, manager, opts) {
    this.code = code;
    this.host = hostNick;
    this.cfg = cfg || '09';
    this.traffic = traffic || 'normal';
    this.historicalAirlines = !!(opts && opts.historicalAirlines);
    this.store = store;
    this.manager = manager;

    this.state = 'lobby';        // 'lobby' | 'ativa'
    this.players = new Map();    // nick -> { ws, pos, chatTimes:[] }
    this.core = null;
    this.airportJson = null;
    this.startedAt = null;

    this.tickTimer = null;
    this.snapAccum = 0;
    this.destroyTimer = null;
  }

  // ---------- jogadores ----------
  addPlayer(nick, ws) {
    this.players.set(nick, { ws, pos: 'OBS', chatTimes: [] });
    this._cancelDestroy();
  }

  removePlayer(nick) {
    if (!this.players.has(nick)) return;
    this.players.delete(nick);
    // se o host saiu e ainda há gente na sessão, promove outro jogador a host
    // (não faz parte do contrato explicitamente, mas evita sessão órfã sem host)
    if (nick === this.host && this.players.size > 0) {
      this.host = this.players.keys().next().value;
    }
    if (this.players.size === 0) this._scheduleDestroy();
  }

  setPosition(nick, pos) {
    if (!['TWR', 'APP', 'OBS'].includes(pos)) return { ok: false, msg: 'posição inválida' };
    const player = this.players.get(nick);
    if (!player) return { ok: false, msg: 'jogador não encontrado' };
    if (pos !== 'OBS') {
      for (const [n, p] of this.players) {
        if (n !== nick && p.pos === pos) return { ok: false, msg: 'posição ' + pos + ' já ocupada' };
      }
    }
    player.pos = pos;
    return { ok: true };
  }

  playersList() {
    return [...this.players.entries()].map(([nick, p]) => ({ nick, pos: p.pos }));
  }

  _positionOwner(pos) {
    for (const [nick, p] of this.players) if (p.pos === pos) return nick;
    return null;
  }

  _cancelDestroy() {
    if (this.destroyTimer) { clearTimeout(this.destroyTimer); this.destroyTimer = null; }
  }

  _scheduleDestroy() {
    this._cancelDestroy();
    this.destroyTimer = setTimeout(() => this.manager._destroySession(this.code), SESSION_EMPTY_TTL_MS);
    if (this.destroyTimer.unref) this.destroyTimer.unref();
  }

  // ---------- broadcast ----------
  broadcast(msg, exceptNick) {
    const data = JSON.stringify(msg);
    for (const [nick, p] of this.players) {
      if (nick === exceptNick) continue;
      if (p.ws && p.ws.readyState === 1 /* OPEN */) p.ws.send(data);
    }
  }

  sendTo(nick, msg) {
    const p = this.players.get(nick);
    if (p && p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }

  sessionSnapshot() {
    return {
      t: 'session', code: this.code, host: this.host, state: this.state,
      players: this.playersList(), cfg: this.cfg, traffic: this.traffic,
      historicalAirlines: this.historicalAirlines,
    };
  }

  broadcastSession() { this.broadcast(this.sessionSnapshot()); }

  // ---------- ciclo de jogo ----------
  start(hostNick) {
    if (hostNick !== this.host) return { ok: false, msg: 'só o host pode iniciar' };
    if (this.state === 'ativa') return { ok: false, msg: 'sessão já iniciada' };

    let airportJson;
    try {
      const file = path.join(__dirname, '..', 'airports', 'sbcv.json');
      airportJson = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return { ok: false, msg: 'falha ao carregar aeroporto: ' + e.message };
    }

    this.airportJson = airportJson;
    AirlineService.applyToData(this.historicalAirlines);
    this.core = new GameCore(airportJson, {
      cfg: this.cfg, traffic: this.traffic, emit: (ev) => this._handleEmit(ev),
    });
    this.state = 'ativa';
    this.startedAt = Date.now();

    this.broadcast({ t: 'start', airport: airportJson, cfg: this.cfg, time: this.core.time });
    this.broadcastSession();

    this.snapAccum = 0;
    this.tickTimer = setInterval(() => {
      try {
        this.core.tick(TICK_DT);
        this.snapAccum += TICK_DT;
        if (this.snapAccum >= 1) {
          this.snapAccum -= 1;
          this.broadcast({ t: 'snap', ...this.core.serialize() });
        }
      } catch (e) {
        console.warn('[session ' + this.code + '] erro no tick:', e.message);
      }
    }, TICK_MS);
    if (this.tickTimer.unref) this.tickTimer.unref();

    return { ok: true };
  }

  // traduz eventos do core (ver §2 do contrato) em mensagens de rede (§3),
  // seguindo o mesmo mapeamento que js/main.js#handleEmit usa no single-player
  _handleEmit(ev) {
    switch (ev.type) {
      case 'radio': {
        const cs = ev.cs !== undefined ? ev.cs : (ev.ac ? ev.ac.cs : undefined);
        const radio = ev.radio !== undefined ? ev.radio : (ev.ac ? ev.ac.radio : undefined);
        this.broadcast({ t: 'radio', who: ev.who, cs, radio, text: ev.text, cls: ev.cls });
        break;
      }
      case 'score': {
        const cls = ev.delta >= 0 ? 'good' : 'bad';
        this.broadcast({
          t: 'radio', who: 'sys',
          text: (ev.delta >= 0 ? '+' : '') + ev.delta + ' pts — ' + ev.why, cls,
        });
        if (ev.delta < 0) {
          this.broadcast({ t: 'event', kind: 'banner', text: ev.why + ' (' + ev.delta + ' pts)', cls: 'bad' });
        }
        break;
      }
      case 'banner':
        this.broadcast({ t: 'event', kind: 'banner', text: ev.text, cls: ev.cls || '' });
        break;
      case 'chime':
        this.broadcast({ t: 'event', kind: 'chime' });
        break;
      case 'alarm':
        this.broadcast({ t: 'event', kind: 'alarm', on: ev.on });
        break;
      case 'atis':
        this.broadcast({
          t: 'radio', who: 'sys',
          text: 'Informação ATIS ' + ev.letter + ' disponível' + (ev.extra ? ' — ' + ev.extra : '') + ': ' + ev.metar,
        });
        break;
      case 'config':
        // não faz parte da enumeração fechada do §3 (banner|chime|alarm), mas é
        // aditivo e inofensivo: cliente que não reconhecer o kind simplesmente ignora
        this.broadcast({ t: 'event', kind: 'config', cfg: ev.cfg, label: ev.label });
        break;
    }
  }

  // ---------- comandos (§4: autoridade por posição) ----------
  cmd(nick, line) {
    if (this.state !== 'ativa' || !this.core) return { ok: false, msg: 'sessão ainda não iniciada' };
    const player = this.players.get(nick);
    if (!player) return { ok: false, msg: 'jogador não encontrado' };
    if (player.pos === 'OBS') return { ok: false, msg: 'observadores não emitem comandos' };

    const tokens = String(line).trim().toUpperCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return { ok: false, msg: 'comando vazio' };

    // no MP o callsign é obrigatório — sem ele não há como saber a aeronave
    const ac = this._findAircraft(tokens[0]);
    if (!ac) return { ok: false, msg: 'inclua o callsign no multiplayer' };

    const domainToken = tokens[1];
    const domain = domainToken && TWR_CMDS.has(domainToken) ? 'TWR' : 'APP';
    const owner = this._positionOwner(domain);
    if (owner && owner !== nick) return { ok: false, msg: 'instrução da posição ' + domain };

    const res = this.core.runCommand(line);
    if (!res || !res.ok) return { ok: false, msg: (res && res.err) || 'comando inválido' };
    return { ok: true };
  }

  // mesma lógica de resolução de callsign do Commands.findAircraft (exato ou
  // sufixo único ≥2 chars), reimplementada aqui pois não é exportada
  _findAircraft(token) {
    if (!this.core) return null;
    const t = token.toUpperCase();
    let ac = this.core.aircraft.find(a => a.cs === t && a.state !== 'done');
    if (ac) return ac;
    const matches = this.core.aircraft.filter(a => a.state !== 'done' && a.cs.endsWith(t) && t.length >= 2);
    return matches.length === 1 ? matches[0] : null;
  }

  // ---------- chat ----------
  chat(nick, text, to) {
    const player = this.players.get(nick);
    if (!player) return { ok: false, msg: 'jogador não encontrado' };
    if (to && !this.players.has(to)) return { ok: false, msg: 'destinatário não encontrado' };

    const now = Date.now();
    player.chatTimes = player.chatTimes.filter(t => now - t < CHAT_WINDOW_MS);
    if (player.chatTimes.length >= CHAT_MAX_MSGS) return { ok: false, msg: 'devagar' };
    player.chatTimes.push(now);

    const clean = String(text == null ? '' : text).slice(0, 500);
    if (!clean.trim()) return { ok: false, msg: 'mensagem vazia' };

    const msg = { t: 'chat', from: nick, to, text: clean };
    if (to) {
      this.sendTo(to, msg);
      if (to !== nick) this.sendTo(nick, msg); // eco pro remetente
    } else {
      this.broadcast(msg);
    }

    if (this.store) {
      this.store.saveChat({ session: this.code, from: nick, to, text: clean }).catch(() => {});
    }
    return { ok: true };
  }

  // ---------- fim ----------
  destroy() {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    this._cancelDestroy();
    if (this.store && this.core) {
      this.store.saveResult({
        code: this.code, host: this.host, cfg: this.cfg, traffic: this.traffic,
        score: this.core.score, stats: this.core.stats, time: this.core.time,
        startedAt: this.startedAt, endedAt: Date.now(),
      }).catch(() => {});
    }
  }
}

class SessionManager {
  constructor(store) {
    this.store = store;
    this.sessions = new Map(); // code -> Session
  }

  create(hostNick, ws, cfg, traffic, opts) {
    let code;
    do { code = randCode(); } while (this.sessions.has(code));
    const session = new Session(code, hostNick, cfg, traffic, this.store, this, opts);
    session.addPlayer(hostNick, ws);
    this.sessions.set(code, session);
    return session;
  }

  join(code, nick, ws) {
    const session = this.sessions.get(String(code).toUpperCase());
    if (!session) return { ok: false, msg: 'sessão não encontrada' };
    if (session.players.has(nick)) return { ok: false, msg: 'nick já em uso nesta sessão' };
    session.addPlayer(nick, ws);
    return { ok: true, session };
  }

  get(code) {
    return this.sessions.get(String(code).toUpperCase()) || null;
  }

  _destroySession(code) {
    const session = this.sessions.get(code);
    if (!session) return;
    session.destroy();
    this.sessions.delete(code);
  }

  // desliga tudo (usado no shutdown do processo/testes)
  shutdownAll() {
    for (const code of [...this.sessions.keys()]) this._destroySession(code);
  }
}

module.exports = { SessionManager, TWR_CMDS };
