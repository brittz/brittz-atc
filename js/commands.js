// ============================================================
// Parser de instruções do controlador
// Sintaxe: CALLSIGN CMD [arg] [CMD arg] ...  (vários por linha)
// Condicionais: CALLSIGN ... APOS [FIXO] [NM] instrução...
//   ex.: GLO1234 DEC 09R APOS 5 A 10000
//        TAM3412 APOS GOMES 5 A 5000
// ============================================================
'use strict';

const Commands = (() => {

  const KNOWN = new Set([
    'A','ALT','D','S','DESCER','SUBIR','V','VEL','SPD',
    'P','PROA','H','HDG','PE','PD','HL','HR',
    'DIR','DCT','DIRETO','VIA','ILS','AP','POUSO','CTL',
    'ALINHAR','LU','DEC','TO','CTO','DECOLAR','TAKEOFF','TKFF','TKOF',
    'ESPERA','HOLD','ARR','GA','ARREMETER','SID','STAR','HO','TRANSFERIR','TRF',
    'ABORTAR','ABT','RTO','REJECT','TAXI','TAXIAR',
  ]);

  // encontra a aeronave pelo callsign completo ou sufixo único
  function findAircraft(token, game) {
    const t = token.toUpperCase();
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
          r = ac.cmdTakeoff(rw);
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
    const raw = line.trim();
    if (!raw) return null;
    const tokens = raw.toUpperCase().split(/\s+/);
    let ac = findAircraft(tokens[0], game);
    let start = 1;
    if (!ac && game.selected && game.selected.state !== 'done') { ac = game.selected; start = 0; }
    if (!ac) return { err: `Callsign "${tokens[0]}" não encontrado.` };

    const rest = tokens.slice(start);
    if (!rest.length) return { err: 'nenhuma instrução informada' };

    // separa a cláusula condicional (APOS/AFTER): o resto da linha é adiado
    const ci = rest.findIndex(t => t === 'APOS' || t === 'APÓS' || t === 'AFTER');
    let immediate = rest, cond = null;
    if (ci >= 0) {
      immediate = rest.slice(0, ci);
      const c = rest.slice(ci + 1);
      // [FIXO] [NM | pés | FLxxx] instrução... — número < 400 é NM, >= 400 é pés
      let fix = null, dist = null, altC = null, j = 0;
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
      cond = { fix, dist, alt: altC, tokens: defTokens };
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
        if (cond.alt != null) parts.push(U.fmtAlt(cond.alt));
        atcParts.push('após ' + parts.join(' + ') + ': ' + cond.tokens.join(' '));
      }
    }

    if (!results.length) return { err: 'nenhuma instrução informada' };
    return { ac, results, atcText: atcParts.join(', ') };
  }

  return { parse, run };
})();
