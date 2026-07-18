// ============================================================
// Holding Pattern (racetrack) — lógica de trajetória isolada
// Entradas ICAO: v1 = direct; parallel/teardrop reservados.
// ============================================================
'use strict';

if (typeof U === 'undefined' && typeof require !== 'undefined') {
  globalThis.U = require('./data.js').U;
}

const Holding = (() => {
  const DEFAULTS = {
    turn: 'R',
    legSec: 60,
    entry: 'direct', // 'direct' | 'parallel' | 'teardrop' (só direct ativo)
    captureNm: 0.75,
    // raio visual / geométrico aproximado do semicírculo (NM)
    turnRadNm: 1.6,
  };

  function create(opts) {
    const inboundHdg = U.norm360(opts.inboundHdg ?? 360);
    const turn = opts.turn === 'L' ? 'L' : 'R';
    return {
      mode: 'hold',
      fix: opts.fix,
      inboundHdg,
      outboundHdg: U.norm360(inboundHdg + 180),
      turn,
      legSec: opts.legSec > 0 ? opts.legSec : DEFAULTS.legSec,
      entry: opts.entry === 'parallel' || opts.entry === 'teardrop' ? opts.entry : 'direct',
      phase: 'entry', // entry | outbound_turn | outbound | inbound_turn | inbound
      phaseT: 0,
      resume: opts.resume || null,
    };
  }

  function hdgClose(a, b, tol) {
    return Math.abs(U.adiff(a, b)) <= (tol || 10);
  }

  function along(hdg, nm) {
    const r = U.d2r(hdg);
    return [Math.sin(r) * nm, Math.cos(r) * nm];
  }

  // perpendicular ao rumo inbound, para o lado da curva do hold
  function offsetHdg(inboundHdg, turn) {
    return U.norm360(inboundHdg + (turn === 'L' ? -90 : 90));
  }

  /**
   * Avança a navegação de espera de uma aeronave (mutates ac.nav).
   * Espera ac.turnToward(target, dt, forced?).
   */
  function update(ac, dt) {
    const nav = ac.nav;
    if (!nav || nav.mode !== 'hold') return;
    const f = U.fix(nav.fix);
    if (!f) return;

    const d = U.dist(ac.x, ac.y, f[0], f[1]);
    const capture = Math.max(DEFAULTS.captureNm, (ac.spd || 180) / 3600 * 12);

    // --- Direct entry: direto ao fixo, depois engata o circuito ---
    // (parallel/teardrop: mesmo contrato de fases; implementação futura)
    if (nav.phase === 'entry') {
      ac.turnToward(U.brg(ac.x, ac.y, f[0], f[1]), dt);
      if (d < capture) {
        nav.phase = 'outbound_turn';
        nav.phaseT = 0;
      }
      return;
    }

    if (nav.phase === 'outbound_turn') {
      ac.turnToward(nav.outboundHdg, dt, nav.turn);
      if (hdgClose(ac.hdg, nav.outboundHdg)) {
        nav.phase = 'outbound';
        nav.phaseT = 0;
      }
      return;
    }

    if (nav.phase === 'outbound') {
      ac.turnToward(nav.outboundHdg, dt);
      nav.phaseT += dt;
      if (nav.phaseT >= nav.legSec) {
        nav.phase = 'inbound_turn';
        nav.phaseT = 0;
      }
      return;
    }

    if (nav.phase === 'inbound_turn') {
      ac.turnToward(nav.inboundHdg, dt, nav.turn);
      if (hdgClose(ac.hdg, nav.inboundHdg)) {
        nav.phase = 'inbound';
        nav.phaseT = 0;
      }
      return;
    }

    if (nav.phase === 'inbound') {
      ac.turnToward(U.brg(ac.x, ac.y, f[0], f[1]), dt);
      nav.phaseT += dt;
      if (d < capture) {
        nav.phase = 'outbound_turn';
        nav.phaseT = 0;
      }
    }
  }

  /**
   * Polyline do racetrack em coordenadas NM (para o radar).
   * Alinhado ao inbound course e ao sentido das curvas.
   */
  function pathPoints(nav, spdHint) {
    const f = U.fix(nav.fix);
    if (!f || !nav.inboundHdg) return [];

    const R = DEFAULTS.turnRadNm;
    const gs = Math.max(spdHint || 180, 120);
    const legNm = Math.max(2.5, (nav.legSec || DEFAULTS.legSec) * gs / 3600);
    const inH = nav.inboundHdg;
    const outH = nav.outboundHdg != null ? nav.outboundHdg : U.norm360(inH + 180);
    const turn = nav.turn === 'L' ? 'L' : 'R';
    const offH = offsetHdg(inH, turn);
    const [ox, oy] = along(offH, 2 * R);

    // Extremidades das pernas (inbound termina no fixo)
    const inStart = [f[0] - along(inH, legNm)[0], f[1] - along(inH, legNm)[1]];
    const outStart = [f[0] + ox, f[1] + oy]; // após curva no fixo
    const outEnd = [outStart[0] + along(outH, legNm)[0], outStart[1] + along(outH, legNm)[1]];

    const pts = [];
    const pushArc = (cx, cy, fromHdg, sweepSign, n) => {
      // arco de 180° centrado em (cx,cy); fromHdg = rumo do raio inicial (do centro ao ponto)
      for (let i = 0; i <= n; i++) {
        const a = U.d2r(U.norm360(fromHdg + sweepSign * 180 * (i / n)));
        pts.push([cx + Math.sin(a) * R, cy + Math.cos(a) * R]);
      }
    };

    // Inbound reto → fixo
    pts.push(inStart);
    pts.push([f[0], f[1]]);

    // Curva no fixo (180° para o lado do hold): centro a 1R no offset
    const c1 = [f[0] + along(offH, R)[0], f[1] + along(offH, R)[1]];
    // no fixo, o raio do centro ao fixo aponta opposite a offH (para o inbound)
    const radFromC1ToFix = U.norm360(offH + 180);
    const sweep = turn === 'R' ? 1 : -1;
    pushArc(c1[0], c1[1], radFromC1ToFix, sweep, 12);

    // Outbound reto
    pts.push(outEnd);

    // Curva no fim do outbound
    const c2 = [outEnd[0] - along(offH, R)[0], outEnd[1] - along(offH, R)[1]];
    const radFromC2ToOutEnd = offH;
    pushArc(c2[0], c2[1], radFromC2ToOutEnd, sweep, 12);

    // Fecha no início do inbound
    pts.push(inStart);
    return pts;
  }

  return { create, update, pathPoints, DEFAULTS };
})();

if (typeof module !== 'undefined') module.exports = { Holding };
