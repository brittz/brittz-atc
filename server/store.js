// ============================================================
// Persistência opcional (server/store.js) — §7 do contrato
// Interface: { saveResult(session), saveChat(msg), close() }
// Sem MONGODB_URI (ou se a conexão falhar) o servidor NUNCA depende do
// Mongo para funcionar: cai num fallback em memória com a MESMA interface.
// ============================================================
'use strict';

// ---------- fallback em memória ----------
function createMemoryStore() {
  const results = [];
  const chats = [];
  return {
    async saveResult(session) {
      results.push({ ...session, at: Date.now() });
      // mantém só os últimos 500 resultados em memória (evita crescer sem limite)
      if (results.length > 500) results.shift();
    },
    async saveChat(msg) {
      chats.push({ ...msg, at: Date.now() });
      if (chats.length > 2000) chats.shift();
    },
    async close() {},
    // acesso direto útil para testes/inspeção
    _mem: { results, chats },
  };
}

// ---------- login Google (scaffold p/ fase seguinte) ----------
// eslint-disable-next-line no-unused-vars
async function authGoogle(idToken) {
  // TODO (fase seguinte): validar idToken via google-auth-library, criar/achar
  // usuário na coleção `users` (por sub/email) e devolver um perfil de sessão.
  throw new Error('authGoogle: login Google ainda não implementado (fase seguinte)');
}

// ---------- store real (MongoDB), com fallback automático ----------
function createMongoStore(uri) {
  const mem = createMemoryStore(); // usado se conectar falhar ou uma operação der erro
  let db = null;
  let client = null;

  const ready = (async () => {
    try {
      // require lazy: se o pacote não estiver instalado por algum motivo, não
      // deve derrubar o servidor — apenas cai no fallback em memória.
      const { MongoClient } = require('mongodb');
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      db = client.db();
      console.log('[store] conectado ao MongoDB');
      try {
        // TTL de 30 dias para o histórico de chat
        await db.collection('chats').createIndex({ at: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
      } catch (e) {
        console.warn('[store] falha ao criar índice TTL de chats:', e.message);
      }
    } catch (e) {
      console.warn('[store] falha ao conectar no MongoDB, usando memória:', e.message);
      db = null;
      client = null;
    }
  })();

  return {
    async saveResult(session) {
      await ready;
      if (!db) return mem.saveResult(session);
      try {
        await db.collection('results').insertOne({ ...session, at: new Date() });
      } catch (e) {
        console.warn('[store] saveResult falhou, usando memória:', e.message);
        return mem.saveResult(session);
      }
    },
    async saveChat(msg) {
      await ready;
      if (!db) return mem.saveChat(msg);
      try {
        await db.collection('chats').insertOne({ ...msg, at: new Date() });
      } catch (e) {
        console.warn('[store] saveChat falhou, usando memória:', e.message);
        return mem.saveChat(msg);
      }
    },
    async close() {
      if (client) { try { await client.close(); } catch (e) { /* ignora */ } }
    },
    authGoogle,
  };
}

// fábrica: escolhe a implementação conforme o ambiente
function createStore() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    const store = createMemoryStore();
    store.authGoogle = authGoogle;
    return store;
  }
  return createMongoStore(uri);
}

module.exports = { createStore };
