// ============================================================
// Parser de instruções do controlador
// Sintaxe: CALLSIGN CMD [arg] [CMD arg] ...  (vários por linha)
// ============================================================
'use strict';

const Commands = (() => {

  // encontra a aeronave pelo callsign completo ou sufixo único
  function findAircraft(token, game) {
    const t = token.toUpperCase();
    let ac = game.aircraft.find(a => a.cs === t && a.state !== 'done');
    if (ac) return ac;
    const matches = game.aircraft.filter(a => a.state !== 'done' && a.cs.endsWith(t) && t.length >= 2);
    if (matches.length === 1) return matches[0];
    return null;
  }

  // interpreta um valor de altitude: "6000", "FL120", "120" (se FL antes)
  function parseAlt(tok) {
    if (!tok) return null;
    const m = tok.match(/^FL(\d{2,3})$/i);
    if (m) return parseInt(m[1], 10) * 100;
    const n = parseInt(tok, 10);
    if (isNaN(n)) return null;
    return n < 400 ? n * 100 : n; // "A 60" = 6000? não: só aceita >= 1000 ou FL
  }

  function parse(line, game) {
    const raw = line.trim();
    if (!raw) return null;
    const tokens = raw.toUpperCase().split(/\s+/);
    let ac = findAircraft(tokens[0], game);
    let i = 1;
    if (!ac && game.selected && game.selected.state !== 'done') { ac = game.selected; i = 0; }
    if (!ac) return { err: `Callsign "${tokens[0]}" não encontrado.` };

    const results = [];
    const atcParts = [];

    while (i < tokens.length) {
      const cmd = tokens[i];
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
          const v = parseInt(arg, 10);
          if (isNaN(v)) { r = { err: 'velocidade inválida' }; used = 1; break; }
          r = ac.cmdSpd(v);
          atcParts.push((v < ac.spd ? 'reduza ' : 'mantenha ') + v + ' nós');
          break;
        }
        case 'P': case 'PROA': case 'H': case 'HDG': case 'PE': case 'PD': case 'HL': case 'HR': {
          const h = parseInt(arg, 10);
          if (isNaN(h) || h < 1 || h > 360) { r = { err: 'proa inválida' }; used = 1; break; }
          const turn = (cmd === 'PE' || cmd === 'HL') ? 'L' : (cmd === 'PD' || cmd === 'HR') ? 'R' : null;
          r = ac.cmdHdg(h, turn);
          atcParts.push((turn === 'L' ? 'curva à esquerda proa ' : turn === 'R' ? 'curva à direita proa ' : 'proa ') + U.fmtHdg(h));
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
          if (!r.err) atcParts.push('desça via STAR ' + ac.star);
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
        case 'DEC': case 'TO': case 'CTO': case 'DECOLAR': {
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
        default:
          r = { err: `comando "${cmd}" desconhecido (veja Ajuda)` };
          used = 1;
      }

      results.push(r);
      i += used;
      if (r && r.err) break; // para no primeiro erro
    }

    if (!results.length) return { err: 'nenhuma instrução informada' };
    return { ac, results, atcText: atcParts.join(', ') };
  }

  return { parse };
})();
