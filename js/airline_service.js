// ============================================================
// AirlineService — acesso à base de companhias (ativa / histórica)
// A engine NÃO lê o JSON: só consome DATA.AIRLINES após applyToData().
// Origem atual: data/airlines.json (substituível no futuro).
// ============================================================
'use strict';

const AirlineService = (() => {
  let records = null;

  function dataRef() {
    if (typeof DATA !== 'undefined') return DATA;
    if (typeof require !== 'undefined') return require('../engine/data.js').DATA;
    throw new Error('AirlineService: DATA indisponível');
  }

  function setRecords(list) {
    records = Array.isArray(list) ? list.slice() : [];
  }

  function loadFromObject(obj) {
    const list = obj && Array.isArray(obj.airlines) ? obj.airlines
      : (Array.isArray(obj) ? obj : []);
    setRecords(list);
    return records;
  }

  /** Browser / async: carrega o JSON via fetch. */
  async function load(url) {
    const r = await fetch(url || 'data/airlines.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('Falha ao carregar companhias (' + r.status + ')');
    return loadFromObject(await r.json());
  }

  /** Node: leitura síncrona do arquivo. */
  function loadSync(filePath) {
    const fs = require('fs');
    const path = require('path');
    const p = filePath || path.join(__dirname, '..', 'data', 'airlines.json');
    return loadFromObject(JSON.parse(fs.readFileSync(p, 'utf8')));
  }

  function isLoaded() { return Array.isArray(records); }

  function all() { return records ? records.slice() : []; }

  function isHistoricalStatus(st) {
    return st === 'encerrada' || st === 'incorporada';
  }

  /**
   * Companhias elegíveis para geração de tráfego.
   * includeHistorical=false → só status "ativa".
   */
  function forTraffic(includeHistorical) {
    return all().filter(a => {
      if (!a || !a.status) return false;
      if (a.status === 'ativa') return true;
      return !!includeHistorical && isHistoricalStatus(a.status);
    });
  }

  /** Formato consumido pelo motor ({ code, radio, types, w }). */
  function toSpawnEntry(rec) {
    const types = (rec.types && rec.types.length) ? rec.types.slice() : ['A320', 'B738'];
    const wDefault = rec.status === 'ativa' ? 3 : 1;
    return {
      code: rec.code || rec.icao,
      radio: rec.callsign || rec.radio || rec.name,
      types,
      w: rec.w != null ? rec.w : wDefault,
    };
  }

  function spawnList(includeHistorical) {
    return forTraffic(includeHistorical).map(toSpawnEntry);
  }

  /** Atualiza DATA.AIRLINES (próximos spawns). Sem regras históricas na engine. */
  function applyToData(includeHistorical) {
    if (!isLoaded()) throw new Error('AirlineService: base não carregada');
    const D = dataRef();
    D.AIRLINES = spawnList(!!includeHistorical);
    return D.AIRLINES;
  }

  return {
    load,
    loadSync,
    loadFromObject,
    isLoaded,
    all,
    forTraffic,
    toSpawnEntry,
    spawnList,
    applyToData,
  };
})();

if (typeof globalThis !== 'undefined') globalThis.AirlineService = AirlineService;
if (typeof module !== 'undefined') module.exports = { AirlineService };
