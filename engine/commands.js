// ============================================================
// Parser de instruções do controlador
// Sintaxe: CALLSIGN CMD [arg] [CMD arg] ...  (vários por linha)
// Condicionais: CALLSIGN ... APOS [FIXO] [NM] instrução...
//   ex.: GLO1234 DEC 09R APOS 5 A 10000
//        TAM3412 APOS GOMES 5 A 5000
// ============================================================
'use strict';

// Compatibilidade dual: no browser DATA/U são globais; em Node importa os irmãos.
if (typeof DATA === 'undefined' && typeof require !== 'undefined') {
  const _d = require('./data.js');
  globalThis.DATA = _d.DATA;
  globalThis.U = _d.U;
}

const Commands = (() => {
  const WORDS = {
    optional: new Set(['AUTORIZADO', 'AUTORIZADA', 'CLEARED', 'PARA', 'ATE', 'AT', 'TO', 'FOR', 'NO', 'NA', 'EM', 'THE', 'PLEASE', 'FAVOR', 'CONTINUE', 'CONTINUE']),
    optionalJoin: new Set(['E', 'AND']),
    runway: new Set(['RWY', 'RUNWAY', 'PISTA']),
    miles: new Set(['NM', 'NM.', 'MILHA', 'MILHAS', 'MILE', 'MILES']),
    feet: new Set(['PE', 'PES', 'PES.', 'FT', 'FEET']),
    knots: new Set(['KT', 'KTS', 'KNOT', 'KNOTS', 'NO', 'NOS']),
    maintain: new Set(['MANTENHA', 'MANTER', 'MAINTAIN']),
    climb: new Set(['SUBA', 'SUBIR', 'SUBIDA', 'CLIMB', 'CLB']),
    descend: new Set(['DESCA', 'DESCER', 'DESCIDA', 'DESCEND', 'DESCENT', 'DES']),
    speed: new Set(['V', 'VEL', 'SPD', 'SPEED', 'VELOCIDADE']),
    heading: new Set(['P', 'PROA', 'H', 'HDG', 'HEADING']),
    direct: new Set(['DIR', 'DCT', 'DIRETO', 'DIRECT']),
    proceed: new Set(['PROSSIGA', 'PROCEED', 'VOE', 'FLY']),
    via: new Set(['VIA']),
    ils: new Set(['ILS']),
    land: new Set(['AP', 'POUSO', 'POUSAR', 'LAND', 'LANDING']),
    lineup: new Set(['ALINHAR', 'ALINHE', 'LINEUP']),
    wait: new Set(['AGUARDE', 'MANTENHA', 'HOLD', 'WAIT']),
    takeoff: new Set(['DEC', 'DECOLAGEM', 'DECOLAR', 'TAKEOFF', 'TKOF', 'TKFF', 'TKOF']),
    hold: new Set(['ESPERA', 'HOLD']),
    goAround: new Set(['ARR', 'GA', 'ARREMETER', 'ARREMETA', 'GOAROUND']),
    sid: new Set(['SID']),
    star: new Set(['STAR']),
    handoff: new Set(['HO', 'TRANSFERIR', 'TRF', 'CENTER', 'CENTRO']),
    abort: new Set(['ABORTAR', 'ABT', 'RTO', 'REJECT']),
    taxi: new Set(['TAXI', 'TAXIAR']),
    cross: new Set(['CRZ', 'CRUZAR', 'CROSS', 'CRUZAMENTO']),
    report: new Set(['REPORTE', 'REPORTAR', 'REPORT', 'REP']),
    after: new Set(['APOS', 'AFTER']),
    reaching: new Set(['ATINGINDO', 'ATINGIR', 'REACHING', 'REACH']),
    leaving: new Set(['DEIXANDO', 'LEAVING']),
    level: new Set(['NIVELADO', 'LEVEL', 'LEVELLED', 'LEVELED']),
    min: new Set(['MIN', 'MINIMA', 'MINIMO', 'MINIMUM']),
    max: new Set(['MAX', 'MAXIMA', 'MAXIMO', 'MAXIMUM']),
    free: new Set(['LIVRE', 'FREE']),
  };

  const CONDITION_MODE = {
    ATINGINDO: 'reaching',
    ATINGIR: 'reaching',
    REACHING: 'reaching',
    REACH: 'reaching',
    DEIXANDO: 'leaving',
    LEAVING: 'leaving',
    NIVELADO: 'level',
    LEVEL: 'level',
    LEVELLED: 'level',
    LEVELED: 'level',
  };

  const KNOWN = new Set([
    'A','ALT','D','S','DESCER','SUBIR','V','VEL','SPD',
    'P','PROA','H','HDG','PE','PD','HL','HR',
    'DIR','DCT','DIRETO','VIA','ILS','AP','POUSO','CTL',
    'ALINHAR','LU','DEC','TO','CTO','DECOLAR','TAKEOFF','TKFF','TKOF',
    'ESPERA','HOLD','ARR','GA','ARREMETER','SID','STAR','HO','TRANSFERIR','TRF',
    'ABORTAR','ABT','RTO','REJECT','TAXI','TAXIAR','CRZ','CRUZAR','CROSS','CRUZAMENTO',
    'REPORTE','REPORTAR','REPORT','REP',
    'NATURE','NATUREZA','NAT','SOULS','POB','FUEL','COMB','COMBUSTIVEL','COMBUSTÍVEL',
    'INTENTIONS','INTENCOES','INTENÇÕES','INTENT','RWY','RUNWAY','PISTA','STATUS','EMERG','EMERGENCIA','EMERGÊNCIA',
  ]);

  function fold(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[.,;:!?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function inSet(token, set) {
    return !!token && set.has(token);
  }

  function skipWords(tokens, i, sets) {
    let j = i;
    while (j < tokens.length && sets.some(set => inSet(tokens[j], set))) j++;
    return j;
  }

  function nextMeaningful(tokens, i) {
    return skipWords(tokens, i, [WORDS.optional, WORDS.optionalJoin]);
  }

  function parseAltPhrase(tokens, i) {
    let j = nextMeaningful(tokens, i);
    if (tokens[j] === 'FL' && /^\d{2,3}$/.test(tokens[j + 1] || ''))
      return { token: 'FL' + parseInt(tokens[j + 1], 10), next: j + 2 };
    if (/^FL\d{2,3}$/.test(tokens[j] || '')) return { token: 'FL' + parseInt(tokens[j].slice(2), 10), next: j + 1 };
    if (/^\d+$/.test(tokens[j] || '')) {
      const n = parseInt(tokens[j], 10);
      if (n < 400 && !inSet(tokens[j + 1], WORDS.feet)) return null;
      j++;
      if (inSet(tokens[j], WORDS.feet)) j++;
      return { token: String(n), next: j };
    }
    return null;
  }

  function parseRunwayPhrase(tokens, i, fallback) {
    let j = nextMeaningful(tokens, i);
    if (inSet(tokens[j], WORDS.runway)) j = nextMeaningful(tokens, j + 1);
    if (tokens[j] && DATA.RUNWAYS[tokens[j]]) return { token: tokens[j], next: j + 1 };
    return { token: fallback || null, next: i };
  }

  function parseFixPhrase(tokens, i) {
    const j = nextMeaningful(tokens, i);
    if (tokens[j] && U.fix(tokens[j])) return { token: tokens[j], next: j + 1 };
    return null;
  }

  function parseSpeedPhrase(tokens, i) {
    let j = nextMeaningful(tokens, i);
    if (inSet(tokens[j], WORDS.speed)) j = nextMeaningful(tokens, j + 1);
    if (inSet(tokens[j], WORDS.min)) return { token: 'MIN', next: j + 1 };
    if (inSet(tokens[j], WORDS.max)) return { token: 'MAX', next: j + 1 };
    if (inSet(tokens[j], WORDS.free)) return { token: 'LIVRE', next: j + 1 };
    if (/^\d+$/.test(tokens[j] || '')) {
      const num = parseInt(tokens[j], 10);
      j++;
      if (inSet(tokens[j], WORDS.knots)) j++;
      return { token: String(num), next: j };
    }
    return null;
  }

  function parseCondition(tokens, i) {
    let j = i;
    let mode = null;
    if (inSet(tokens[j], WORDS.after)) {
      j = nextMeaningful(tokens, j + 1);
    } else {
      if (tokens[j] === 'AO') j = nextMeaningful(tokens, j + 1);
      if (!CONDITION_MODE[tokens[j]]) return null;
      mode = CONDITION_MODE[tokens[j]];
      j = nextMeaningful(tokens, j + 1);
    }

    if (CONDITION_MODE[tokens[j]]) {
      mode = CONDITION_MODE[tokens[j]];
      j = nextMeaningful(tokens, j + 1);
    }

    if (tokens[j] && U.fix(tokens[j])) {
      const cond = [tokens[j]];
      j = nextMeaningful(tokens, j + 1);
      if (/^\d+(\.\d+)?$/.test(tokens[j] || '') && !mode) {
        cond.push(String(parseFloat(tokens[j])));
        j++;
        if (inSet(tokens[j], WORDS.miles)) j++;
      }
      return { condTokens: cond, next: j };
    }

    if (/^\d+(\.\d+)?$/.test(tokens[j] || '') && !mode) {
      const n = parseFloat(tokens[j]);
      if (n < 400 && !inSet(tokens[j + 1], WORDS.feet)) {
        j++;
        if (inSet(tokens[j], WORDS.miles)) j++;
        return { condTokens: [String(n)], next: j };
      }
    }

    const alt = parseAltPhrase(tokens, j);
    if (!alt) return null;
    const condTokens = [];
    if (mode === 'leaving') condTokens.push('DEIXANDO');
    else if (mode === 'level') condTokens.push('NIVELADO');
    else if (mode === 'reaching') condTokens.push('ATINGINDO');
    condTokens.push(alt.token);
    return { condTokens, next: alt.next };
  }

  function canonicalizeTokens(tokens) {
    const out = [];
    let i = 0;

    while (i < tokens.length) {
      const t = tokens[i];
      if (!t) { i++; continue; }

      const cond = parseCondition(tokens, i);
      if (cond) {
        out.push('APOS', ...cond.condTokens);
        const rest = canonicalizeTokens(tokens.slice(cond.next));
        out.push(...rest);
        break;
      }
      if (inSet(t, WORDS.after)) { out.push('APOS'); i++; continue; }

      if (inSet(t, WORDS.optional) || inSet(t, WORDS.optionalJoin)) { i++; continue; }

      if (inSet(t, WORDS.maintain)) {
        const j = nextMeaningful(tokens, i + 1);
        if (inSet(tokens[j], WORDS.heading) || /^\d{1,3}$/.test(tokens[j] || '')) {
          const arg = inSet(tokens[j], WORDS.heading) ? nextMeaningful(tokens, j + 1) : j;
          if (/^\d{1,3}$/.test(tokens[arg] || '')) { out.push('P', tokens[arg]); i = arg + 1; continue; }
        }
        if (inSet(tokens[j], WORDS.speed) || inSet(tokens[j], WORDS.min) || inSet(tokens[j], WORDS.max) || inSet(tokens[j], WORDS.free)) {
          const spd = parseSpeedPhrase(tokens, j);
          if (spd) { out.push('V', spd.token); i = spd.next; continue; }
        }
        if (inSet(tokens[j], WORDS.via) || inSet(tokens[j], WORDS.sid) || inSet(tokens[j], WORDS.star)) {
          out.push('VIA');
          i = j + 1;
          if (inSet(tokens[j], WORDS.via)) i = nextMeaningful(tokens, j + 1);
          if (inSet(tokens[i], WORDS.sid) || inSet(tokens[i], WORDS.star)) i++;
          continue;
        }
        const alt = parseAltPhrase(tokens, i + 1);
        if (alt) { out.push('A', alt.token); i = alt.next; continue; }
        i++;
        continue;
      }

      if (inSet(t, WORDS.climb) || inSet(t, WORDS.descend)) {
        const j = nextMeaningful(tokens, i + 1);
        if (inSet(tokens[j], WORDS.via) || inSet(tokens[j], WORDS.sid) || inSet(tokens[j], WORDS.star)) {
          out.push('VIA');
          i = j + 1;
          if (inSet(tokens[j], WORDS.via)) i = nextMeaningful(tokens, j + 1);
          if (inSet(tokens[i], WORDS.sid) || inSet(tokens[i], WORDS.star)) i++;
          continue;
        }
        const alt = parseAltPhrase(tokens, i + 1);
        if (alt) { out.push('A', alt.token); i = alt.next; continue; }
      }

      if (inSet(t, WORDS.speed)) {
        const spd = parseSpeedPhrase(tokens, i + 1);
        if (spd) { out.push('V', spd.token); i = spd.next; continue; }
      }
      if (t === 'REDUZA' || t === 'REDUZIR' || t === 'SLOW') {
        const spd = parseSpeedPhrase(tokens, i + 1);
        if (spd) { out.push('V', spd.token); i = spd.next; continue; }
      }
      if (t === 'ACELERE' || t === 'ACELERAR') {
        const spd = parseSpeedPhrase(tokens, i + 1);
        if (spd) { out.push('V', spd.token); i = spd.next; continue; }
      }

      if (inSet(t, WORDS.heading)) {
        const j = nextMeaningful(tokens, i + 1);
        if (/^\d{1,3}$/.test(tokens[j] || '')) { out.push('P', tokens[j]); i = j + 1; continue; }
        const fix = parseFixPhrase(tokens, i + 1);
        if (fix) { out.push('P', fix.token); i = fix.next; continue; }
      }

      if (inSet(t, WORDS.proceed)) {
        const j = nextMeaningful(tokens, i + 1);
        if (inSet(tokens[j], WORDS.direct)) {
          const fix = parseFixPhrase(tokens, j + 1);
          if (fix) { out.push('DIR', fix.token); i = fix.next; continue; }
        }
        const fix = parseFixPhrase(tokens, i + 1);
        if (fix) { out.push('DIR', fix.token); i = fix.next; continue; }
      }

      if (inSet(t, WORDS.direct)) {
        const fix = parseFixPhrase(tokens, i + 1);
        if (fix) { out.push('DIR', fix.token); i = fix.next; continue; }
      }

      if (inSet(t, WORDS.via)) {
        out.push('VIA');
        i = nextMeaningful(tokens, i + 1);
        if (inSet(tokens[i], WORDS.sid) || inSet(tokens[i], WORDS.star)) i++;
        continue;
      }

      if (inSet(t, WORDS.ils)) {
        const rw = parseRunwayPhrase(tokens, i + 1);
        out.push('ILS');
        if (rw.token) out.push(rw.token);
        i = rw.token ? rw.next : i + 1;
        continue;
      }

      if (inSet(t, WORDS.land)) {
        const rw = parseRunwayPhrase(tokens, i + 1);
        out.push('AP');
        if (rw.token) out.push(rw.token);
        i = rw.token ? rw.next : i + 1;
        continue;
      }

      if (inSet(t, WORDS.lineup)) {
        const j = nextMeaningful(tokens, i + 1);
        const rw = parseRunwayPhrase(tokens, inSet(tokens[j], WORDS.wait) ? j + 1 : i + 1);
        out.push('ALINHAR');
        if (rw.token) out.push(rw.token);
        i = rw.token ? rw.next : j + (inSet(tokens[j], WORDS.wait) ? 1 : 0);
        continue;
      }

      if (inSet(t, WORDS.takeoff)) {
        const rw = parseRunwayPhrase(tokens, i + 1);
        out.push('DEC');
        if (rw.token) out.push(rw.token);
        i = rw.token ? rw.next : i + 1;
        continue;
      }

      if (inSet(t, WORDS.hold)) {
        const fix = parseFixPhrase(tokens, i + 1);
        out.push('ESPERA');
        if (fix) out.push(fix.token);
        i = fix ? fix.next : i + 1;
        continue;
      }

      if (inSet(t, WORDS.goAround)) { out.push('ARR'); i++; continue; }
      if (inSet(t, WORDS.sid)) {
        const j = nextMeaningful(tokens, i + 1);
        out.push('SID');
        if (tokens[j]) out.push(tokens[j]);
        i = tokens[j] ? j + 1 : i + 1;
        continue;
      }
      if (inSet(t, WORDS.star)) {
        const j = nextMeaningful(tokens, i + 1);
        out.push('STAR');
        if (tokens[j]) out.push(tokens[j]);
        i = tokens[j] ? j + 1 : i + 1;
        continue;
      }
      if (inSet(t, WORDS.handoff)) { out.push('HO'); i++; continue; }
      if (inSet(t, WORDS.abort)) { out.push('ABORTAR'); i++; continue; }

      if (inSet(t, WORDS.taxi)) {
        const rw = parseRunwayPhrase(tokens, i + 1);
        out.push('TAXI');
        if (rw.token) out.push(rw.token);
        i = rw.token ? rw.next : i + 1;
        continue;
      }

      if (inSet(t, WORDS.cross)) { out.push('CRZ'); i++; continue; }

      if (inSet(t, WORDS.report)) {
        out.push('REPORTE');
        const j = nextMeaningful(tokens, i + 1);
        if (inSet(tokens[j], WORDS.leaving)) {
          const alt = parseAltPhrase(tokens, j + 1);
          if (alt) { out.push('DEIXANDO', alt.token); i = alt.next; continue; }
        }
        if (inSet(tokens[j], WORDS.reaching)) {
          const alt = parseAltPhrase(tokens, j + 1);
          if (alt) { out.push('ATINGINDO', alt.token); i = alt.next; continue; }
        }
        if (inSet(tokens[j], WORDS.level)) {
          const alt = parseAltPhrase(tokens, j + 1);
          if (alt) { out.push('NIVELADO', alt.token); i = alt.next; continue; }
        }
        const fix = parseFixPhrase(tokens, j);
        if (fix) { out.push(fix.token); i = fix.next; continue; }
        if (/^\d+(\.\d+)?$/.test(tokens[j] || '')) {
          out.push(String(parseFloat(tokens[j])));
          i = j + 1;
          if (inSet(tokens[i], WORDS.miles)) i++;
          continue;
        }
        i = j;
        continue;
      }

      if (t === 'FL' && /^\d{2,3}$/.test(tokens[i + 1] || '')) { out.push('A', 'FL' + parseInt(tokens[i + 1], 10)); i += 2; continue; }
      if (KNOWN.has(t) || DATA.RUNWAYS[t] || U.fix(t) || /^FL\d{2,3}$/.test(t) || /^\d+(\.\d+)?$/.test(t)) { out.push(t); i++; continue; }
      i++;
    }
    return out;
  }

  // encontra a aeronave pelo callsign completo ou sufixo único
  function findAircraft(token, game) {
    const t = fold(token);
    let ac = game.aircraft.find(a => a.cs === t && a.state !== 'done');
    if (ac) return ac;
    const matches = game.aircraft.filter(a => a.state !== 'done' && a.cs.endsWith(t) && t.length >= 2);
    if (matches.length === 1) return matches[0];
    return null;
  }

  // interpreta um valor de altitude: "6000" ou "FL120"
  function parseAlt(tok) {
    if (!tok) return null;
    const m = tok.match(/^FL(\d{2,3})$/i);
    if (m) return parseInt(m[1], 10) * 100;
    const n = parseInt(tok, 10);
    if (isNaN(n)) return null;
    return n < 400 ? n * 100 : n;
  }

  function parseReport(tokens, i, ac) {
    const a = tokens[i + 1];
    const b = tokens[i + 2];
    if (!a) return { r: { err: 'REPORTE: informe a condição desejada' }, used: 1 };

    const distTok = a.match(/^(\d+(?:\.\d+)?)NM$/);
    if (distTok) {
      const dist = parseFloat(distTok[1]);
      return { r: ac.addReport({ kind: 'dist', dist }), used: 2, atc: 'reporte a ' + dist + ' milhas do aeródromo' };
    }
    if (/^\d+(\.\d+)?$/.test(a)) {
      const dist = parseFloat(a);
      if (dist < 400) return { r: ac.addReport({ kind: 'dist', dist }), used: 2, atc: 'reporte a ' + dist + ' milhas do aeródromo' };
      return { r: { err: 'REPORTE: para altitude use DEIXANDO, ATINGINDO ou NIVELADO' }, used: 2 };
    }
    if (a === 'SOBRE' || a === 'CRUZANDO') {
      if (!b || !U.fix(b)) return { r: { err: 'REPORTE: informe um fixo válido' }, used: b ? 3 : 2 };
      return { r: ac.addReport({ kind: 'fix', fix: b }), used: 3, atc: 'reporte sobre ' + b };
    }
    if (a === 'DEIXANDO' || a === 'ATINGINDO' || a === 'NIVELADO' || a === 'NIVEL') {
      const alt = parseAlt(b);
      if (alt === null) return { r: { err: 'REPORTE: altitude inválida' }, used: b ? 3 : 2 };
      const mode = a === 'DEIXANDO' ? 'leaving' : a === 'ATINGINDO' ? 'reaching' : 'level';
      const phrase = mode === 'leaving' ? 'deixando ' : mode === 'level' ? 'nivelado em ' : 'atingindo ';
      const altText = /^FL\d{2,3}$/.test(b) ? b : U.fmtAlt(alt);
      return { r: ac.addReport({ kind: 'alt', alt, altText, mode }), used: 3, atc: 'reporte ' + phrase + altText };
    }
    if (U.fix(a)) return { r: ac.addReport({ kind: 'fix', fix: a }), used: 2, atc: 'reporte sobre ' + a };
    return { r: { err: 'REPORTE: use distância, fixo, DEIXANDO, ATINGINDO ou NIVELADO' }, used: 2 };
  }

  // executa uma sequência de instruções imediatas na aeronave
  function run(ac, tokens, game) {
    const results = [];
    const atcParts = [];
    let i = 0;

    while (i < tokens.length) {
      const cmd = tokens[i];
      // tolera o callsign repetido (seleção preencheu o campo, jogador digitou de novo)
      if (cmd === ac.cs) { i++; continue; }
      const arg = tokens[i + 1];
      let r = null, used = 2;

      switch (cmd) {
        case 'A': case 'ALT': case 'D': case 'S': case 'DESCER': case 'SUBIR': {
          const alt = parseAlt(arg);
          if (alt === null) { r = { err: 'altitude inválida' }; used = 1; break; }
          r = ac.cmdAlt(alt);
          atcParts.push((alt < ac.alt ? 'desça para ' : 'suba para ') + U.fmtAlt(alt));
          break;
        }
        case 'V': case 'VEL': case 'SPD': {
          if (arg === 'LIVRE' || arg === 'FREE') { r = ac.cmdSpd(0); atcParts.push('velocidade livre'); break; }
          if (arg === 'MIN' || arg === 'MINIMA' || arg === 'MÍNIMA') { r = ac.cmdSpd('MIN'); atcParts.push('reduza para a mínima operacional'); break; }
          if (arg === 'MAX' || arg === 'MAXIMA' || arg === 'MÁXIMA') { r = ac.cmdSpd('MAX'); atcParts.push('velocidade máxima'); break; }
          const v = parseInt(arg, 10);
          if (isNaN(v)) { r = { err: 'velocidade inválida' }; used = 1; break; }
          r = ac.cmdSpd(v);
          atcParts.push((v < ac.spd ? 'reduza ' : 'mantenha ') + v + ' nós');
          break;
        }
        case 'P': case 'PROA': case 'H': case 'HDG': case 'PE': case 'PD': case 'HL': case 'HR': {
          const turn = (cmd === 'PE' || cmd === 'HL') ? 'L' : (cmd === 'PD' || cmd === 'HR') ? 'R' : null;
          let h = null, viaFix = null;
          if (arg && /^\d{1,3}$/.test(arg)) h = parseInt(arg, 10);
          else if (arg && U.fix(arg)) { viaFix = arg; h = Math.round(U.brg(ac.x, ac.y, U.fix(arg)[0], U.fix(arg)[1])); }
          if (h === null || h < 1 || h > 360) { r = { err: 'proa inválida (número 1–360 ou nome de fixo)' }; used = 1; break; }
          r = ac.cmdHdg(h, turn);
          if (!r.err && viaFix) r.rb += ' (' + viaFix + ')';
          atcParts.push((turn === 'L' ? 'curva à esquerda proa ' : turn === 'R' ? 'curva à direita proa ' : 'proa ') +
            U.fmtHdg(h) + (viaFix ? ' (direção ' + viaFix + ')' : ''));
          break;
        }
        case 'DIR': case 'DCT': case 'DIRETO': {
          if (!arg) { r = { err: 'informe o fixo' }; used = 1; break; }
          r = ac.cmdDirect(arg);
          atcParts.push('prossiga direto ' + arg);
          break;
        }
        case 'VIA': {
          r = ac.cmdVia(); used = 1;
          if (!r.err) atcParts.push(ac.kind === 'dep' ? 'suba via SID ' + ac.sid : 'desça via STAR ' + ac.star);
          break;
        }
        case 'ILS': {
          if (!arg) { r = { err: 'informe a pista' }; used = 1; break; }
          r = ac.cmdIls(arg);
          atcParts.push('autorizado aproximação ILS pista ' + arg);
          break;
        }
        case 'AP': case 'POUSO': case 'CTL': {
          r = ac.cmdLand(arg); used = arg && DATA.RUNWAYS[arg] ? 2 : 1;
          if (!r.err) atcParts.push('autorizado pouso pista ' + ac.app.rwy);
          break;
        }
        case 'ALINHAR': case 'LU': {
          const rw = arg && DATA.RUNWAYS[arg] ? arg : ac.rwy; used = arg && DATA.RUNWAYS[arg] ? 2 : 1;
          r = ac.cmdLineup(rw);
          if (!r.err) atcParts.push('alinhe e mantenha pista ' + rw);
          break;
        }
        case 'DEC': case 'TO': case 'CTO': case 'DECOLAR': case 'TAKEOFF': case 'TKFF': case 'TKOF': {
          const rw = arg && DATA.RUNWAYS[arg] ? arg : null; used = rw ? 2 : 1;
          r = ac.cmdTakeoff(rw, game);
          if (!r.err) atcParts.push('vento ' + game.windStr() + ', autorizado decolagem pista ' + ac.rwy);
          break;
        }
        case 'ESPERA': case 'HOLD': {
          if (!arg) { r = { err: 'informe o fixo de espera' }; used = 1; break; }
          r = ac.cmdHold(arg);
          if (!r.err) atcParts.push('espera sobre ' + arg);
          break;
        }
        case 'ARR': case 'GA': case 'ARREMETER': {
          r = ac.cmdGoAround(); used = 1;
          if (!r.err) atcParts.push('arremeta');
          break;
        }
        case 'SID': {
          if (!arg) { r = { err: 'informe a SID' }; used = 1; break; }
          r = ac.cmdSid(arg);
          if (!r.err) atcParts.push('saída ' + arg);
          break;
        }
        case 'STAR': {
          if (!arg) { r = { err: 'informe a STAR' }; used = 1; break; }
          r = ac.cmdStar(arg);
          if (!r.err) atcParts.push('chegada ' + arg);
          break;
        }
        case 'HO': case 'TRANSFERIR': case 'TRF': {
          r = ac.cmdHandoff(game); used = 1;
          if (!r.err) atcParts.push('chame o Centro em 125.05, bom voo');
          break;
        }
        case 'ABORTAR': case 'ABT': case 'RTO': case 'REJECT': {
          r = ac.cmdAbort(); used = 1;
          if (!r.err) atcParts.push('cancele a decolagem, abandone quando puder');
          break;
        }
        case 'TAXI': case 'TAXIAR': {
          if (!arg) { r = { err: 'informe a cabeceira (ex.: TAXI 27L)' }; used = 1; break; }
          r = ac.cmdTaxi(arg);
          if (!r.err) atcParts.push('taxie para a cabeceira ' + arg);
          break;
        }
        case 'CRZ': case 'CRUZAR': case 'CROSS': case 'CRUZAMENTO': {
          r = ac.cmdCross(); used = 1;
          if (!r.err) atcParts.push('autorizado cruzamento da zona do aeródromo, reporte deixando');
          break;
        }
        case 'REPORTE': case 'REPORTAR': case 'REPORT': case 'REP': {
          const rep = parseReport(tokens, i, ac);
          r = rep.r; used = rep.used;
          if (!r.err && rep.atc) atcParts.push(rep.atc);
          break;
        }
        case 'NATURE': case 'NATUREZA': case 'NAT': {
          r = ac.cmdEmergencyQuery(cmd); used = 1;
          if (!r.err) atcParts.push('informe a natureza da emergência');
          break;
        }
        case 'SOULS': case 'POB': {
          r = ac.cmdEmergencyQuery(cmd); used = 1;
          if (!r.err) atcParts.push('informe pessoas a bordo');
          break;
        }
        case 'FUEL': case 'COMB': case 'COMBUSTIVEL': case 'COMBUSTÍVEL': {
          r = ac.cmdEmergencyQuery(cmd); used = 1;
          if (!r.err) atcParts.push('informe combustível restante');
          break;
        }
        case 'INTENTIONS': case 'INTENCOES': case 'INTENÇÕES': case 'INTENT': {
          r = ac.cmdEmergencyQuery(cmd); used = 1;
          if (!r.err) atcParts.push('informe intenções');
          break;
        }
        case 'RWY': case 'RUNWAY': case 'PISTA': {
          r = ac.cmdEmergencyQuery(cmd); used = 1;
          if (!r.err) atcParts.push('informe pista preferida');
          break;
        }
        case 'STATUS': case 'EMERG': case 'EMERGENCIA': case 'EMERGÊNCIA': {
          r = ac.cmdEmergencyQuery(cmd); used = 1;
          if (!r.err) atcParts.push('informe a situação atual');
          break;
        }
        default:
          r = { err: `comando "${cmd}" desconhecido (veja Ajuda)` };
          used = 1;
      }

      results.push(r);
      i += used;
      // um erro não descarta o resto da linha: o piloto cumpre o que puder
      // e responde "Negativo" ao que não puder
    }

    return { results, atcParts };
  }

  function parse(line, game) {
    const raw = fold(line);
    if (!raw) return null;
    const tokens = raw.split(/\s+/);
    let ac = findAircraft(tokens[0], game);
    let start = 1;
    if (!ac && game.selected && game.selected.state !== 'done') { ac = game.selected; start = 0; }
    if (!ac) return { err: `Callsign "${tokens[0]}" não encontrado.` };

    const rest = canonicalizeTokens(tokens.slice(start));
    if (!rest.length) return { err: 'nenhuma instrução informada' };

    // separa a cláusula condicional (APOS/AFTER): o resto da linha é adiado
    const ci = rest.findIndex(t => t === 'APOS' || t === 'AFTER');
    let immediate = rest, cond = null;
    if (ci >= 0) {
      immediate = rest.slice(0, ci);
      const c = rest.slice(ci + 1);
      // [FIXO] [NM | pés | FLxxx] instrução... — número < 400 é NM, >= 400 é pés
      let fix = null, dist = null, altC = null, altMode = 'crossing', j = 0;
      if (CONDITION_MODE[c[j]]) { altMode = CONDITION_MODE[c[j]]; j++; }
      if (c[j] && U.fix(c[j])) { fix = c[j]; j++; }
      if (c[j]) {
        const fl = c[j].match(/^FL(\d{2,3})$/);
        if (fl) { altC = parseInt(fl[1], 10) * 100; j++; }
        else if (/^\d+(\.\d+)?$/.test(c[j])) {
          const n = parseFloat(c[j]);
          if (n >= 400) altC = n; else dist = n;
          j++;
        }
      }
      const defTokens = c.slice(j);
      if (fix && altC !== null) return { err: 'APOS: combine fixo com distância, não com altitude' };
      if (!fix && dist === null && altC === null)
        return { err: 'APOS: informe um fixo, distância em NM ou altitude (ex.: APOS GOMES 5 · APOS 5000 · APOS FL80)' };
      if (!defTokens.length) return { err: 'APOS: informe a instrução a executar' };
      if (!KNOWN.has(defTokens[0])) return { err: `APOS: instrução "${defTokens[0]}" desconhecida` };
      cond = { fix, dist, alt: altC, altMode, tokens: defTokens };
    }

    const { results, atcParts } = immediate.length ? run(ac, immediate, game) : { results: [], atcParts: [] };

    // a condicional é armada mesmo se alguma instrução imediata foi recusada
    if (cond) {
      const v = ac.addPending(cond);
      results.push(v);
      if (!v.err) {
        const parts = [];
        if (cond.fix) parts.push(cond.fix);
        if (cond.dist) parts.push(cond.dist + ' NM');
        if (cond.alt != null) {
          if (cond.altMode === 'leaving') parts.push('deixando ' + U.fmtAlt(cond.alt));
          else if (cond.altMode === 'level') parts.push('nivelado em ' + U.fmtAlt(cond.alt));
          else if (cond.altMode === 'reaching') parts.push('atingindo ' + U.fmtAlt(cond.alt));
          else parts.push(U.fmtAlt(cond.alt));
        }
        atcParts.push('após ' + parts.join(' + ') + ': ' + cond.tokens.join(' '));
      }
    }

    if (!results.length) return { err: 'nenhuma instrução informada' };
    return { ac, results, atcText: atcParts.join(', ') };
  }

  return { parse, run };
})();

if (typeof module !== 'undefined') module.exports = { Commands };
