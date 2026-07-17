// ============================================================
// server/index.js — HTTP estático (raiz do projeto) + WebSocket (/ws)
// Ver docs/ARQUITETURA-MP.md §3, §4, §7, §8.
// ============================================================
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { SessionManager } = require('./sessions.js');
const { createStore } = require('./store.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8124;
const NICK_RE = /^[A-Za-z0-9]{2,16}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// ---------- HTTP estático (sem path traversal) ----------
function handleStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch (e) { res.writeHead(400); res.end('Bad request'); return; }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  // normaliza e recusa qualquer caminho que escape da raiz do projeto
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const store = createStore();
const manager = new SessionManager(store);

const server = http.createServer((req, res) => {
  try { handleStatic(req, res); }
  catch (e) { res.writeHead(500); res.end('Erro interno'); }
});

const wss = new WebSocketServer({ server, path: '/ws' });

function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* conexão fechando, ignora */ }
  }
}

function onDisconnect(conn) {
  if (conn.session) {
    conn.session.removePlayer(conn.nick);
    conn.session.broadcastSession();
    conn.session = null;
  }
}

// roteia uma mensagem já parseada (§3 do contrato)
function route(conn, msg) {
  if (!msg || typeof msg.t !== 'string') return safeSend(conn.ws, { t: 'error', msg: 'mensagem inválida' });

  switch (msg.t) {
    case 'hello': {
      const nick = String(msg.nick || '');
      if (!NICK_RE.test(nick)) return safeSend(conn.ws, { t: 'error', msg: 'nick inválido (2-16 alfanumérico)' });
      conn.nick = nick;
      safeSend(conn.ws, { t: 'hello-ok', nick });
      break;
    }

    case 'create': {
      if (!conn.nick) return safeSend(conn.ws, { t: 'error', msg: 'diga hello antes' });
      if (conn.session) return safeSend(conn.ws, { t: 'error', msg: 'já está em uma sessão' });
      const cfg = typeof msg.cfg === 'string' ? msg.cfg : undefined;
      const traffic = typeof msg.traffic === 'string' ? msg.traffic : undefined;
      const session = manager.create(conn.nick, conn.ws, cfg, traffic);
      conn.session = session;
      safeSend(conn.ws, session.sessionSnapshot());
      break;
    }

    case 'join': {
      if (!conn.nick) return safeSend(conn.ws, { t: 'error', msg: 'diga hello antes' });
      if (conn.session) return safeSend(conn.ws, { t: 'error', msg: 'já está em uma sessão' });
      const code = String(msg.code || '');
      const r = manager.join(code, conn.nick, conn.ws);
      if (!r.ok) return safeSend(conn.ws, { t: 'error', msg: r.msg });
      conn.session = r.session;
      // sessão já em andamento: manda o estado inicial pro recém-chegado agora;
      // os próximos snaps (1 Hz) chegam pelo laço normal
      if (r.session.state === 'ativa' && r.session.airportJson) {
        safeSend(conn.ws, {
          t: 'start', airport: r.session.airportJson, cfg: r.session.cfg,
          time: r.session.core ? r.session.core.time : 0,
        });
      }
      r.session.broadcastSession();
      break;
    }

    case 'position': {
      if (!conn.session) return safeSend(conn.ws, { t: 'error', msg: 'entre em uma sessão primeiro' });
      const r = conn.session.setPosition(conn.nick, msg.pos);
      if (!r.ok) return safeSend(conn.ws, { t: 'error', msg: r.msg });
      conn.session.broadcastSession();
      break;
    }

    case 'start': {
      if (!conn.session) return safeSend(conn.ws, { t: 'error', msg: 'entre em uma sessão primeiro' });
      const r = conn.session.start(conn.nick);
      if (!r.ok) return safeSend(conn.ws, { t: 'error', msg: r.msg });
      break;
    }

    case 'cmd': {
      if (!conn.session) return safeSend(conn.ws, { t: 'error', msg: 'entre em uma sessão primeiro' });
      const r = conn.session.cmd(conn.nick, String(msg.line || ''));
      if (!r.ok) safeSend(conn.ws, { t: 'error', msg: r.msg });
      break;
    }

    case 'chat': {
      if (!conn.session) return safeSend(conn.ws, { t: 'error', msg: 'entre em uma sessão primeiro' });
      const to = msg.to ? String(msg.to) : undefined;
      const r = conn.session.chat(conn.nick, String(msg.text || ''), to);
      if (!r.ok) safeSend(conn.ws, { t: 'error', msg: r.msg });
      break;
    }

    case 'leave': {
      onDisconnect(conn);
      break;
    }

    default:
      safeSend(conn.ws, { t: 'error', msg: 'tipo de mensagem desconhecido: ' + msg.t });
  }
}

wss.on('connection', (ws) => {
  const conn = { ws, nick: null, session: null };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      safeSend(ws, { t: 'error', msg: 'JSON inválido' });
      return;
    }
    try {
      route(conn, msg);
    } catch (e) {
      console.warn('[ws] erro ao processar mensagem:', e.message);
      safeSend(ws, { t: 'error', msg: 'erro interno ao processar mensagem' });
    }
  });

  ws.on('close', () => onDisconnect(conn));
  ws.on('error', () => onDisconnect(conn));
});

server.listen(PORT, () => {
  console.log(`ATC multiplayer server em http://localhost:${PORT} (ws em /ws)`);
});

// encerramento gracioso (Ctrl+C / testes)
function shutdown() {
  manager.shutdownAll();
  wss.close();
  server.close(() => process.exit(0));
  store.close().catch(() => {});
  // se algo travar o close (ex.: conexões abertas), força a saída
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { server, wss, manager, store };
