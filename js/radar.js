// ============================================================
// Radar: renderização em canvas (HiDPI), pan/zoom, mouse e toque
// ============================================================
'use strict';

const Radar = (() => {
  let cv, ctx, game;
  let scale = 7;              // px (CSS) por NM
  let cx = 0, cy = 0;         // centro da vista em NM
  let vw = 0, vh = 0, dpr = 1; // dimensões lógicas e densidade de pixels
  let sweep = 0;
  let mouse = { x: 0, y: 0, down: false, moved: false, sx: 0, sy: 0 };

  const C = {
    bg: '#070d12', ring: '#12303a', ringTxt: '#2a5563', boundary: '#1d4a58',
    fix: '#33606e', fixTxt: '#4d8496', rwy: '#c8d8dc', ctrline: '#25505c',
    arr: '#5fd7ff', dep: '#7dff9f', sel: '#ffe066', warn: '#ffb454', alert: '#ff4d5e',
    trail: '#3a7a8a', route: '#2f6ea0', loc: '#3d8f5f', hold: '#8a7adf',
  };

  function toScreen(x, y) {
    return [vw / 2 + (x - cx) * scale, vh / 2 - (y - cy) * scale];
  }
  function toWorld(px, py) {
    return [(px - vw / 2) / scale + cx, -(py - vh / 2) / scale + cy];
  }

  function setZoom(newScale, px, py) {
    const [wx, wy] = toWorld(px, py);
    scale = Math.max(2.5, Math.min(80, newScale));
    const [nx, ny] = toWorld(px, py);
    cx += wx - nx; cy += wy - ny;
  }

  // ---------------- interação ----------------
  // tap/clique: seleciona aeronave; com aeronave selecionada, tocar num fixo
  // monta "DIR fixo" e tocar numa cabeceira monta "ILS"/"DEC" (confirmar depois)
  function handleTap(px, py) {
    let best = null, bestD = 20;
    for (const a of game.aircraft) {
      if (a.state === 'done' || a.state === 'taxi') continue;
      const [sx, sy] = toScreen(a.x, a.y);
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best) { game.select(best); return; }

    const sel = game.selected;
    if (sel && sel.state !== 'done') {
      // cabeceira de pista?
      for (const [id, r] of Object.entries(DATA.RUNWAYS)) {
        const [sx, sy] = toScreen(r.thr[0], r.thr[1]);
        if (Math.hypot(sx - px, sy - py) < 16) {
          if (sel.airborne && sel.kind === 'arr' && sel.app.phase === 'none')
            UI.propose(sel.cs + ' ILS ' + id);
          else if (sel.airborne && sel.app.phase !== 'none' && sel.app.rwy === id && !sel.landClr)
            UI.propose(sel.cs + ' AP');
          else if (['holdshort', 'lineup'].includes(sel.state))
            UI.propose(sel.cs + ' DEC ' + id);
          return;
        }
      }
      // fixo?
      let bf = null, bfD = 18;
      for (const [name, [fx, fy]] of Object.entries(DATA.FIXES)) {
        const [sx, sy] = toScreen(fx, fy);
        const d = Math.hypot(sx - px, sy - py);
        if (d < bfD) { bfD = d; bf = name; }
      }
      if (bf && sel.airborne) { UI.propose(sel.cs + ' DIR ' + bf); return; }
      // espaço vazio: propõe vetor (proa da aeronave até o ponto tocado)
      if (sel.airborne) {
        const [wx, wy] = toWorld(px, py);
        const h = Math.round(U.brg(sel.x, sel.y, wx, wy) / 5) * 5;
        UI.propose(sel.cs + ' P ' + U.fmtHdg(h === 0 ? 360 : h));
        return;
      }
    }
    game.select(null);
  }

  function init(canvas, g) {
    cv = canvas; ctx = cv.getContext('2d'); game = g;
    resize();
    window.addEventListener('resize', resize);

    // ----- mouse -----
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      setZoom(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.offsetX, e.offsetY);
    }, { passive: false });

    cv.addEventListener('mousedown', e => {
      mouse.down = true; mouse.moved = false; mouse.sx = e.offsetX; mouse.sy = e.offsetY;
    });
    cv.addEventListener('mouseleave', () => { mouse.inside = false; });
    cv.addEventListener('mousemove', e => {
      mouse.x = e.offsetX; mouse.y = e.offsetY; mouse.inside = true;
      if (mouse.down) {
        const dx = e.offsetX - mouse.sx, dy = e.offsetY - mouse.sy;
        if (Math.hypot(dx, dy) > 4) mouse.moved = true;
        if (mouse.moved) {
          cx -= dx / scale; cy += dy / scale;
          mouse.sx = e.offsetX; mouse.sy = e.offsetY;
        }
      }
    });
    cv.addEventListener('mouseup', e => {
      mouse.down = false;
      if (!mouse.moved) handleTap(e.offsetX, e.offsetY);
    });

    // ----- toque (celular/tablet): 1 dedo = pan/tap, 2 dedos = pinch zoom -----
    let tPan = null, tPinch = null, tMoved = false, tStart = null;
    const pos = t => {
      const r = cv.getBoundingClientRect();
      return [t.clientX - r.left, t.clientY - r.top];
    };
    cv.addEventListener('touchstart', e => {
      e.preventDefault();
      UI.dismissKeyboard(); // tocar no radar fecha o teclado do sistema
      if (e.touches.length === 1) {
        const [x, y] = pos(e.touches[0]);
        tPan = { x, y }; tMoved = false; tStart = { x, y, t: performance.now() };
        tPinch = null;
      } else if (e.touches.length === 2) {
        const [x1, y1] = pos(e.touches[0]), [x2, y2] = pos(e.touches[1]);
        tPinch = { d0: Math.hypot(x2 - x1, y2 - y1), s0: scale };
        tPan = null; tMoved = true;
      }
    }, { passive: false });
    cv.addEventListener('touchmove', e => {
      e.preventDefault();
      if (tPinch && e.touches.length === 2) {
        const [x1, y1] = pos(e.touches[0]), [x2, y2] = pos(e.touches[1]);
        const d = Math.hypot(x2 - x1, y2 - y1);
        setZoom(tPinch.s0 * (d / tPinch.d0), (x1 + x2) / 2, (y1 + y2) / 2);
      } else if (tPan && e.touches.length === 1) {
        const [x, y] = pos(e.touches[0]);
        const dx = x - tPan.x, dy = y - tPan.y;
        if (Math.hypot(x - tStart.x, y - tStart.y) > 8) tMoved = true;
        if (tMoved) { cx -= dx / scale; cy += dy / scale; }
        tPan = { x, y };
      }
    }, { passive: false });
    cv.addEventListener('touchend', e => {
      e.preventDefault();
      if (e.touches.length === 0) {
        if (tPan !== null && !tMoved && tStart && performance.now() - tStart.t < 600)
          handleTap(tStart.x, tStart.y);
        tPan = null; tPinch = null;
      } else if (e.touches.length === 1 && tPinch) {
        const [x, y] = pos(e.touches[0]);
        tPinch = null; tPan = { x, y }; tMoved = true;
      }
    }, { passive: false });
  }

  function resize() {
    const r = cv.parentElement.getBoundingClientRect();
    vw = Math.max(1, r.width); vh = Math.max(1, r.height);
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);
    cv.style.width = vw + 'px';
    cv.style.height = vh + 'px';
    const fit = Math.min(vw, vh) / (DATA.AIRPORT.range * 2.15);
    if (scale < fit * 0.8) scale = fit;
  }

  function fitView() {
    cx = 0; cy = 0;
    scale = Math.min(vw, vh) / (DATA.AIRPORT.range * 2.15);
  }

  // ---------------- desenho ----------------
  function draw(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // nitidez em telas HiDPI
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, vw, vh);
    ctx.font = '11px "Cascadia Code", Consolas, monospace';

    drawRings();
    drawSweep(dt);
    drawFixes();
    drawRunways();
    if (game.selected) drawIntent(game.selected);
    for (const a of game.aircraft) if (a.airborne || a.state === 'takeoff' || a.state === 'rollout' || a.state === 'lineup' || a.state === 'holdshort') drawAircraft(a);
    drawConflicts();
    drawCursorInfo();
  }

  // linha entre pares em alerta STCA, com a distância atual
  function drawConflicts() {
    for (const p of (game.conflictPairs || [])) {
      const [x1, y1] = toScreen(p.a.x, p.a.y);
      const [x2, y2] = toScreen(p.b.x, p.b.y);
      ctx.save();
      ctx.strokeStyle = p.loss ? C.alert : C.warn;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.fillText(p.d.toFixed(1) + ' NM', (x1 + x2) / 2 + 5, (y1 + y2) / 2 - 5);
      ctx.restore();
    }
  }

  function drawRings() {
    const [ox, oy] = toScreen(0, 0);
    ctx.strokeStyle = C.ring; ctx.fillStyle = C.ringTxt; ctx.lineWidth = 1;
    for (let r = 10; r < DATA.AIRPORT.range; r += 10) {
      ctx.beginPath(); ctx.arc(ox, oy, r * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.fillText(r + '', ox + 3, oy - r * scale - 3);
    }
    ctx.strokeStyle = C.boundary; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(ox, oy, DATA.AIRPORT.range * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.boundary;
    ctx.fillText('LIMITE TMA ' + DATA.AIRPORT.range + ' NM', ox + 6, oy - DATA.AIRPORT.range * scale + 14);
  }

  function drawSweep(dt) {
    if (!game.settings.sweep) return;
    sweep += dt * 1.4;
    const [ox, oy] = toScreen(0, 0);
    const R = DATA.AIRPORT.range * scale;
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = '#4be2a0'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.sin(sweep) * R, oy - Math.cos(sweep) * R);
    ctx.stroke();
    ctx.restore();
  }

  function drawFixes() {
    ctx.strokeStyle = C.fix; ctx.fillStyle = C.fixTxt;
    for (const [name, [fx, fy]] of Object.entries(DATA.FIXES)) {
      const [sx, sy] = toScreen(fx, fy);
      if (sx < -20 || sy < -20 || sx > vw + 20 || sy > vh + 20) continue;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 4); ctx.lineTo(sx - 4, sy + 3); ctx.lineTo(sx + 4, sy + 3); ctx.closePath();
      ctx.stroke();
      if (game.settings.fixNames) ctx.fillText(name, sx + 6, sy + 4);
    }
  }

  function drawRunways() {
    ctx.lineWidth = Math.max(2, scale * 0.09);
    const drawnPairs = new Set();
    for (const [id, r] of Object.entries(DATA.RUNWAYS)) {
      const pair = DATA.RWY_PAIR[id];
      if (drawnPairs.has(pair)) continue;
      drawnPairs.add(pair);
      const [x1, y1] = toScreen(r.thr[0], r.thr[1]);
      const ex = r.thr[0] + Math.sin(U.d2r(r.hdg)) * r.len;
      const ey = r.thr[1] + Math.cos(U.d2r(r.hdg)) * r.len;
      const [x2, y2] = toScreen(ex, ey);
      // linha central estendida dos dois lados (13 NM)
      ctx.strokeStyle = C.ctrline; ctx.lineWidth = 1; ctx.setLineDash([8, 8]);
      for (const [bx, by, hdg] of [[r.thr[0], r.thr[1], r.hdg + 180], [ex, ey, r.hdg]]) {
        const fx = bx + Math.sin(U.d2r(hdg)) * 13;
        const fy = by + Math.cos(U.d2r(hdg)) * 13;
        const [sx1, sy1] = toScreen(bx, by); const [sx2, sy2] = toScreen(fx, fy);
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
      }
      ctx.setLineDash([]);
      // pista
      ctx.strokeStyle = C.rwy; ctx.lineWidth = Math.max(2.5, scale * 0.1);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      // identificadores
      ctx.fillStyle = C.rwy; ctx.font = '10px Consolas, monospace';
      ctx.fillText(id, x1 - 24, y1 + 4);
      ctx.fillText(r.opp, x2 + 6, y2 + 4);
      ctx.font = '11px "Cascadia Code", Consolas, monospace';
    }
  }

  // rota/intenção da aeronave selecionada
  function drawIntent(a) {
    if (!a.airborne) return;
    ctx.save();
    ctx.strokeStyle = C.route; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
    if (a.nav.mode === 'route') {
      ctx.beginPath();
      let [sx, sy] = toScreen(a.x, a.y);
      ctx.moveTo(sx, sy);
      for (let i = a.nav.idx; i < a.nav.route.length; i++) {
        const f = U.fix(a.nav.route[i]);
        [sx, sy] = toScreen(f[0], f[1]);
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    } else if (a.nav.mode === 'hold') {
      const f = U.fix(a.nav.fix);
      const [sx, sy] = toScreen(f[0], f[1]);
      ctx.strokeStyle = C.hold;
      ctx.beginPath(); ctx.arc(sx, sy, 2.2 * scale, 0, Math.PI * 2); ctx.stroke();
    }
    // localizador da aproximação autorizada
    if (a.app.phase !== 'none') {
      const r = DATA.RUNWAYS[a.app.rwy];
      const bx = r.thr[0] - Math.sin(U.d2r(r.hdg)) * 16;
      const by = r.thr[1] - Math.cos(U.d2r(r.hdg)) * 16;
      const [x1, y1] = toScreen(r.thr[0], r.thr[1]);
      const [x2, y2] = toScreen(bx, by);
      ctx.strokeStyle = C.loc; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawAircraft(a) {
    const [sx, sy] = toScreen(a.x, a.y);
    const sel = game.selected === a;
    let col = a.kind === 'arr' ? C.arr : C.dep;
    if (a.stca === 1) col = C.warn;
    if (a.stca === 2) col = (Math.floor(performance.now() / 300) % 2) ? C.alert : '#7a1020';
    if (a.emergency) col = (Math.floor(performance.now() / 500) % 2) ? C.alert : col;

    // trilha
    ctx.fillStyle = C.trail;
    a.trail.forEach(([tx, ty], i) => {
      const [px, py] = toScreen(tx, ty);
      ctx.globalAlpha = 0.12 + 0.5 * (i / a.trail.length);
      ctx.fillRect(px - 1, py - 1, 2, 2);
    });
    ctx.globalAlpha = 1;

    // anel de separação (3 NM de diâmetro… raio 1,5 NM: anéis encostando = 3 NM)
    if (a.airborne && (sel || a.stca > 0)) {
      ctx.save();
      ctx.strokeStyle = a.stca === 2 ? C.alert : a.stca === 1 ? C.warn : C.sel;
      ctx.globalAlpha = 0.35; ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, 1.5 * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // símbolo
    ctx.strokeStyle = sel ? C.sel : col;
    ctx.lineWidth = sel ? 2 : 1.4;
    ctx.strokeRect(sx - 4, sy - 4, 8, 8);

    if (a.airborne) {
      // vetor de 1 minuto
      const vx = Math.sin(U.d2r(a.hdg)) * (a.spd / 60) * scale;
      const vy = -Math.cos(U.d2r(a.hdg)) * (a.spd / 60) * scale;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + vx, sy + vy); ctx.stroke();
    }

    // data block
    const altH = Math.round(a.alt / 100);
    const vsChar = a.vs > 150 ? '↑' : a.vs < -150 ? '↓' : ' ';
    const clrH = Math.round(a.clrAlt / 100);
    let l3 = '';
    if (a.app.phase === 'gs') l3 = 'ILS ' + a.app.rwy + (a.landClr ? ' ✓P' : '');
    else if (a.app.phase === 'loc') l3 = 'LOC ' + a.app.rwy;
    else if (a.app.phase === 'cleared') l3 = '→ILS ' + a.app.rwy;
    else if (a.nav.mode === 'hold') l3 = 'ESP ' + a.nav.fix;
    else if (a.via) l3 = 'VIA ' + a.star;
    else if (a.nav.mode === 'route' && a.nav.route[a.nav.idx]) l3 = '→' + a.nav.route[a.nav.idx];
    else if (a.nav.mode === 'hdg' && a.airborne) l3 = 'PROA ' + U.fmtHdg(a.nav.hdg);
    if (a.state === 'holdshort') l3 = 'PRONTO ' + a.rwy;
    if (a.state === 'lineup') l3 = 'ALINHADO ' + a.rwy;
    if (a.state === 'takeoff') l3 = 'ROLANDO ' + a.rwy;
    if (a.state === 'rollout') l3 = 'POUSOU';
    if (a.goingAround) l3 = 'ARREMETIDA';

    const lines = [
      a.cs + (a.emergency ? ' ⚠' : '') + (a.perf.wtc === 'H' ? ' /H' : ''),
      a.onGround ? a.type : String(altH).padStart(3, '0') + vsChar + String(clrH).padStart(3, '0') + ' ' + Math.round(a.spd),
      l3,
    ];
    ctx.fillStyle = sel ? C.sel : col;
    const bx = sx + 10, by = sy - 14;
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(sx + 5, sy - 5); ctx.lineTo(bx - 2, by + 8); ctx.stroke();
    ctx.globalAlpha = 1;
    lines.forEach((t, i) => t && ctx.fillText(t, bx, by + i * 12));
  }

  // leitura do cursor (canto superior direito, livre do painel e da barra
  // de comando) e régua aeronave selecionada → cursor
  function drawCursorInfo() {
    if (!mouse.inside) return;
    const [wx, wy] = toWorld(mouse.x, mouse.y);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.ringTxt;
    ctx.fillText(`APT ${U.fmtHdg(U.brg(0, 0, wx, wy))}° / ${U.dist(0, 0, wx, wy).toFixed(1)} NM`, vw - 12, 20);

    const s = game.selected;
    if (s && s.airborne) {
      const [ax, ay] = toScreen(s.x, s.y);
      const brg = U.brg(s.x, s.y, wx, wy);
      const dst = U.dist(s.x, s.y, wx, wy);
      ctx.save();
      ctx.strokeStyle = C.sel; ctx.globalAlpha = 0.65; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = C.sel;
      ctx.fillText(`${s.cs} ${U.fmtHdg(brg)}° / ${dst.toFixed(1)} NM`, vw - 12, 36);
      ctx.textAlign = 'left';
      ctx.fillText(`${U.fmtHdg(brg)}°/${dst.toFixed(1)}`, mouse.x + 14, mouse.y - 10);
    }
    ctx.textAlign = 'left';
  }

  return { init, draw, fitView };
})();
