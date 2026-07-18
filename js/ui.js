// ============================================================
// UI: strips, log, painel de seleção, cartas, som e voz
// ============================================================
'use strict';

const UI = (() => {
  let game;
  const $ = id => document.getElementById(id);
  // dispositivo de toque: nunca focar o input programaticamente
  // (senão o teclado do sistema fica abrindo a toda hora)
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  // ---------------- áudio ----------------
  let actx = null;
  function audio() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function radioClick() {
    if (!game.settings.sound) return;
    try {
      const a = audio(), t = a.currentTime;
      const buf = a.createBuffer(1, a.sampleRate * 0.05, a.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length) * 0.25;
      const src = a.createBufferSource(); src.buffer = buf;
      const g = a.createGain(); g.gain.value = 0.35;
      src.connect(g).connect(a.destination); src.start(t);
    } catch (e) {}
  }
  let alarmOsc = null;
  function setAlarm(on) {
    if (!game.settings.sound) on = false;
    if (on && !alarmOsc) {
      try {
        const a = audio();
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'square'; o.frequency.value = 780;
        g.gain.value = 0.05;
        o.connect(g).connect(a.destination);
        o.start();
        let hi = true;
        alarmOsc = { o, g, iv: setInterval(() => {
          if (!alarmOsc) return;
          const t = a.currentTime;
          hi = !hi;
          alarmOsc.g.gain.setValueAtTime(hi ? 0.05 : 0, t);
          alarmOsc.o.frequency.setValueAtTime(hi ? 780 : 620, t);
        }, 260) };
      } catch (e) {}
    } else if (!on && alarmOsc) {
      clearInterval(alarmOsc.iv);
      try { alarmOsc.o.stop(); } catch (e) {}
      alarmOsc = null;
    }
  }
  function chime() {
    if (!game.settings.sound) return;
    try {
      const a = audio(), t = a.currentTime;
      [660, 880].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.12, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.25);
        o.connect(g).connect(a.destination);
        o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.3);
      });
    } catch (e) {}
  }

  // ---------------- voz (Web Speech) ----------------
  let voices = [];
  function loadVoices() {
    voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('pt'));
  }
  function speak(ac, text) {
    if (!game.settings.tts || !('speechSynthesis' in window)) return;
    loadVoices();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    if (voices.length) u.voice = voices[hash(ac.cs) % voices.length];
    u.rate = 1.15 + (hash(ac.cs) % 4) * 0.06;
    u.pitch = 0.8 + (hash(ac.cs) % 7) * 0.09;
    u.volume = 0.9;
    speechSynthesis.speak(u);
  }
  function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

  // ---------------- log de comunicações ----------------
  function log(from, text, cls) {
    const el = document.createElement('div');
    el.className = 'msg ' + (cls || '');
    const t = game.clock();
    el.innerHTML = `<span class="t">${t}</span> <span class="who">${from}</span> ${text}`;
    const box = $('log');
    box.appendChild(el);
    while (box.children.length > 120) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }
  function logATC(text) { log('SBCV APP', text, 'atc'); radioClick(); }
  function logPilot(ac, text) {
    log(ac.cs, text, 'pilot' + (ac.emergency ? ' emg' : ''));
    radioClick();
    speak(ac, text.replace(ac.cs, '').trim() + ', ' + spellCallsign(ac));
  }
  function logSys(text, cls) { log('SISTEMA', text, 'sys ' + (cls || '')); }

  // chat do multiplayer (conteúdo vem de outros jogadores: escapar HTML)
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function logChat(from, text, priv) {
    const who = priv ? '🔒 ' + esc(from) + ' → você:' : '💬 ' + esc(from) + ':';
    log(who, esc(text), 'chatmsg' + (priv ? ' priv' : ''));
  }

  function spellCallsign(ac) {
    const num = ac.cs.replace(/^[A-Z]+/, '').split('').join(' ');
    return ac.radio + ' ' + num;
  }

  function emergencySummary(a) {
    if (!a.emergency) return '';
    return `${a.emergency.title || 'Emergência'} · ${Emergency.labelSeverity(a.emergency.severity || 'medium')} · ${Emergency.labelStage(a.emergency.stage || 'declared')}`;
  }

  function emergencyEvolutionLabel(ev) {
    return { stable: 'estável', improving: 'melhorando', worsening: 'piorando' }[ev] || ev || '';
  }

  function emergencyInfoHtml(a) {
    if (!a.emergency) return '';
    const entries = Emergency.queryEntries(a.emergency).filter(it => {
      if (it.key === 'status') return true;
      return !!(a.emergency.answers && a.emergency.answers[it.key]);
    });
    if (!entries.length) return '';
    return '<span class="ttl">Informações da emergência</span>' +
      entries.map(it => `<div><b>${it.label}:</b> ${it.value}</div>`).join('');
  }

  // ---------------- strips ----------------
  // Os elementos são REUTILIZADOS entre atualizações (reconciliação): destruir
  // e recriar o DOM a cada refresh engolia cliques que estivessem em andamento.
  const stripEls = new Map(); // callsign -> elemento
  function syncChildren(box, desired) {
    const current = [...box.children];
    if (current.length === desired.length && current.every((c, i) => c === desired[i])) return;
    desired.forEach(el => box.appendChild(el));
  }
  function refreshStrips() {
    const arrBox = $('stripsArr'), depBox = $('stripsDep');
    const seen = new Set();
    const order = { arr: [], dep: [] };
    let na = 0, nd = 0;
    for (const a of game.aircraft) {
      if (a.state === 'done') continue;
      seen.add(a.cs);
      let el = stripEls.get(a.cs);
      if (!el) {
        el = document.createElement('div');
        const cs = a.cs;
        el.onclick = () => {
          const ac = game.aircraft.find(x => x.cs === cs && x.state !== 'done');
          if (ac) game.select(ac);
        };
        stripEls.set(a.cs, el);
      }
      const cls = 'strip ' + a.kind + (game.selected === a ? ' sel' : '') +
        (a.stca === 2 ? ' alert' : a.stca === 1 ? ' warn' : '') + (a.emergency ? ' emg' : '');
      if (el.className !== cls) el.className = cls;
      const status = stripStatus(a);
      const proc = a.kind === 'arr' ? (a.star || '—') : a.kind === 'hel' ? 'VFR' : (a.sid || '—');
      const html =
        `<div class="s1"><b>${a.cs}</b><span>${a.type}/${a.perf.wtc}</span><span>${a.kind === 'arr' ? '' : a.dest || ''}</span></div>` +
        `<div class="s2"><span>${proc}</span><span>${a.onGround ? '' : Math.round(a.alt / 100).toString().padStart(3, '0') + '↦' + Math.round(a.clrAlt / 100).toString().padStart(3, '0')}</span><span class="st">${status}</span></div>`;
      if (el._html !== html) { el._html = html; el.innerHTML = html; }
      // helicópteros entram na lista de chegadas (tráfego que chama você)
      if (a.kind === 'dep') { order.dep.push(el); nd++; } else { order.arr.push(el); na++; }
    }
    for (const [cs, el] of stripEls) if (!seen.has(cs)) { el.remove(); stripEls.delete(cs); }
    syncChildren(arrBox, order.arr);
    syncChildren(depBox, order.dep);
    $('countArr').textContent = na;
    $('countDep').textContent = nd;
  }

  function stripStatus(a) {
    if (a.emergency && a.emergency.active) {
      const base = Emergency.labelStage(a.emergency.stage || 'declared').toUpperCase();
      if (a.state === 'rollout') return 'EMG PÓS-POUSO';
      return 'EMG ' + base;
    }
    if (a.kind === 'hel') {
      if (!a.heliAuto) return 'VETOR';
      return { inbound: a.crossRequested ? 'PEDE CRZ' : 'VFR', waiting: 'AGUARDA CRZ',
               crossing: 'CRUZANDO', clear: 'DEIXANDO' }[a.heliState] || 'VFR';
    }
    if (a.state === 'taxi') return 'TÁXI ' + Math.ceil(a.timer) + 's';
    if (a.state === 'holdshort') return 'PRONTO ' + a.rwy;
    if (a.state === 'lineup') return 'ALINHADO';
    if (a.state === 'takeoff') return 'DECOLANDO';
    if (a.state === 'abort') return 'RTO';
    if (a.state === 'rollout') return 'POUSOU';
    if (a.goingAround) return 'ARREMET.';
    if (a.app.phase === 'gs') return (a.landClr ? 'POUSO ' : 'FINAL ') + a.app.rwy;
    if (a.app.phase === 'loc') return 'LOC ' + a.app.rwy;
    if (a.app.phase === 'cleared') return 'ILS ' + a.app.rwy;
    if (a.nav.mode === 'hold') return 'ESPERA';
    if (a.via) return 'DESC VIA';
    if (a.nav.mode === 'hdg' && a.airborne) return 'VETOR';
    return a.kind === 'arr' ? 'STAR' : 'SUBIDA';
  }

  // ---------------- roletas de ajuste fino (ALT / PROA / VEL) ----------------
  const WHEELS = {
    alt: { el: 'wAlt', min: 2000, max: 24000, step: 1000, cmd: 'A',
           fmt: v => v >= 10000 ? 'FL' + v / 100 : (v / 1000).toFixed(0) + '.000' },
    hdg: { el: 'wHdg', min: 5, max: 360, step: 5, wrap: true, cmd: 'P', fmt: v => U.fmtHdg(v) },
    spd: { el: 'wSpd', min: 120, max: 340, step: 10, cmd: 'V', fmt: v => v + '' },
  };
  const wheelVals = { alt: 5000, hdg: 90, spd: 250 };
  // roleta "tocada" (ajuste ainda não transmitido) não é sobrescrita pelo sync
  const wheelStaged = { alt: false, hdg: false, spd: false };
  let wheelCs = null;  // callsign para o qual as roletas foram inicializadas
  let quickSig = '';   // assinatura do conjunto atual de botões rápidos

  function wheelDisplay() {
    for (const [k, w] of Object.entries(WHEELS))
      document.querySelector('#' + w.el + ' .wv').textContent = w.fmt(wheelVals[k]);
  }
  // valores de referência: a autorização vigente da aeronave
  // ALT = autorizada · PROA = designada (vetor) ou atual · VEL = designada ou indicada
  function wheelBasis(a) {
    return {
      alt: Math.max(2000, Math.min(24000, Math.round(a.clrAlt / 1000) * 1000 || 5000)),
      hdg: (Math.round((a.nav.mode === 'hdg' ? a.nav.hdg : a.depHdg != null && a.onGround ? a.depHdg : a.hdg) / 5) * 5) % 360 || 360,
      spd: Math.max(120, Math.min(340, Math.round((a.clrSpd > 0 ? a.clrSpd : a.spd || 250) / 10) * 10)),
    };
  }
  function wheelInitFor(a) {
    wheelCs = a.cs;
    Object.assign(wheelVals, wheelBasis(a));
    wheelStaged.alt = wheelStaged.hdg = wheelStaged.spd = false;
    wheelDisplay();
  }
  // acompanha novas autorizações (ex.: V 210 dado por texto) sem apagar ajustes em curso
  function wheelSync(a) {
    const b = wheelBasis(a);
    let changed = false;
    for (const k of Object.keys(wheelVals)) {
      if (!wheelStaged[k] && wheelVals[k] !== b[k]) { wheelVals[k] = b[k]; changed = true; }
    }
    if (changed) wheelDisplay();
  }
  function wheelUnstage() {
    wheelStaged.alt = wheelStaged.hdg = wheelStaged.spd = false;
  }
  function bumpWheel(k, dir) {
    wheelStaged[k] = true;
    const w = WHEELS[k];
    let v = wheelVals[k] + dir * w.step;
    if (w.wrap) { if (v > w.max) v = w.min; if (v < w.min) v = w.max; }
    else v = Math.max(w.min, Math.min(w.max, v));
    wheelVals[k] = v;
    wheelDisplay();
  }
  function proposeWheel(k) {
    const a = game.selected;
    if (!a || a.state === 'done') return;
    const w = WHEELS[k];
    propose(a.cs + ' ' + w.cmd + ' ' + (k === 'hdg' ? U.fmtHdg(wheelVals[k]) : wheelVals[k]));
    $('btnQuickSend').classList.add('pending');
  }
  function attachWheel(k) {
    const w = WHEELS[k];
    const box = document.getElementById(w.el);
    const val = box.querySelector('.wv');
    box.querySelector('.wm').onclick = () => { bumpWheel(k, -1); proposeWheel(k); };
    box.querySelector('.wp').onclick = () => { bumpWheel(k, +1); proposeWheel(k); };
    val.addEventListener('wheel', e => { e.preventDefault(); bumpWheel(k, e.deltaY < 0 ? 1 : -1); proposeWheel(k); }, { passive: false });
    // arrastar (mouse ou dedo): para cima aumenta, para baixo diminui
    let lastY = null, dragged = false;
    val.addEventListener('pointerdown', e => {
      lastY = e.clientY; dragged = false;
      val.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    val.addEventListener('pointermove', e => {
      if (lastY === null) return;
      let dy = lastY - e.clientY;
      while (dy >= 12) { bumpWheel(k, 1); dy -= 12; lastY -= 12; dragged = true; }
      while (dy <= -12) { bumpWheel(k, -1); dy += 12; lastY += 12; dragged = true; }
    });
    val.addEventListener('pointerup', () => {
      if (dragged) proposeWheel(k);
      lastY = null;
    });
    val.addEventListener('pointercancel', () => { lastY = null; });
  }

  // ---------------- painéis de seleção (informações + ações) ----------------
  function refreshSelPanel() {
    const p = $('selPanel');
    const q = $('quickPanel');
    const a = game.selected;
    if (!a || a.state === 'done') { p.classList.add('hidden'); q.classList.add('hidden'); wheelCs = null; quickSig = ''; return; }
    p.classList.remove('hidden');
    q.classList.remove('hidden');
    if (wheelCs !== a.cs) wheelInitFor(a);
    else wheelSync(a);
    $('selCs').textContent = a.cs + (a.emergency ? ' ⚠ EMERGÊNCIA' : '');
    $('selInfo').textContent =
      `${a.type}/${a.perf.wtc} · ` + (a.kind === 'arr' ? 'Chegada ' + (a.star || '')
        : a.kind === 'hel' ? 'Helicóptero VFR — cruzamento da zona'
        : 'Saída ' + (a.sid || '') + (a.dest ? ' → ' + a.dest : ''));
    let nextFix = '';
    if (a.airborne && a.nav.mode === 'route' && a.nav.route[a.nav.idx])
      nextFix = ` · →${a.nav.route[a.nav.idx]} ${a.fixDist(a.nav.route[a.nav.idx]).toFixed(1)} NM`;
    $('selData').textContent = a.onGround
      ? `No solo — ${stripStatus(a)}`
      : `ALT ${Math.round(a.alt)} ft (autz ${Math.round(a.clrAlt)}) · VEL ${Math.round(a.spd)} kt · PROA ${U.fmtHdg(a.hdg)} · ${stripStatus(a)}${nextFix}`;
    if (a.emergency) {
      $('selEmergency').classList.remove('hidden');
      $('selEmergency').textContent = emergencySummary(a) +
        (a.emergency.evolution ? ' · ' + emergencyEvolutionLabel(a.emergency.evolution) : '') +
        (a.emergency.info && a.emergency.info.runway ? ' · prefere ' + a.emergency.info.runway : '');
      const infoHtml = emergencyInfoHtml(a);
      $('selEmergencyInfo').classList.toggle('hidden', !infoHtml);
      $('selEmergencyInfo').innerHTML = infoHtml;
    } else {
      $('selEmergency').classList.add('hidden');
      $('selEmergency').textContent = '';
      $('selEmergencyInfo').classList.add('hidden');
      $('selEmergencyInfo').innerHTML = '';
    }
    $('selPend').innerHTML = (a.pending || []).map(p => '⏳ ' + p.label).join('<br>');
    $('selPend').style.display = (a.pending && a.pending.length) ? '' : 'none';

    // ações contextuais (o ajuste fino de ALT/PROA/VEL fica nas roletas).
    // Os botões só são recriados quando o conjunto muda — recriar a cada
    // refresh (400 ms) engolia cliques em andamento.
    const items = [];
    const btn = (label, cmd, cls) => items.push({ label, cmd, cls: cls || '' });
    const cfg = DATA.CONFIGS[game.cfg];
    if (a.state === 'holdshort') {
      btn('Alinhar ' + a.rwy, 'ALINHAR ' + a.rwy);
      btn('Decolagem ' + a.rwy, 'DEC ' + a.rwy, 'good');
      btn('Decolagem + subir VIA SID', 'DEC ' + a.rwy + ' VIA', 'good');
      if (DATA.RWY_PAIR[a.rwy] !== DATA.RWY_PAIR[cfg.depRwy])
        btn('Táxi p/ ' + cfg.depRwy, 'TAXI ' + cfg.depRwy, 'alt');
    } else if (a.state === 'lineup') {
      btn('Decolagem ' + a.rwy, 'DEC ' + a.rwy, 'good');
      btn('Decolagem + subir VIA SID', 'DEC ' + a.rwy + ' VIA', 'good');
      btn('Abandonar a pista', 'ABORTAR', 'bad');
    } else if (a.state === 'takeoff') {
      btn('ABORTAR decolagem', 'ABORTAR', 'bad');
    } else if (a.airborne) {
      if (a.kind === 'arr') {
        if (a.star && !a.via && a.nav.mode === 'route') btn('Descer VIA STAR', 'VIA', 'good');
      } else if (a.sid && DATA.SIDS[a.sid] && a.clrAlt < (DATA.SIDS[a.sid].top || 15000)) {
        btn('Subir VIA SID', 'VIA', 'good');
      }
      if (a.kind === 'arr') {
        if (a.app.phase === 'none') {
          btn('ILS ' + cfg.arrRwy, 'ILS ' + cfg.arrRwy, 'good');
          btn('ILS ' + cfg.depRwy, 'ILS ' + cfg.depRwy);
        } else if (!a.landClr) {
          btn('Autorizar pouso', 'AP', 'good');
          btn('Arremeter', 'ARR', 'bad');
        } else btn('Arremeter', 'ARR', 'bad');
      } else if (a.kind === 'hel') {
        if (!a.crossCleared) btn('Autorizar cruzamento', 'CRZ', 'good');
      } else {
        btn('Transferir ao Centro', 'HO', 'good');
      }
      if (a.emergency) {
        Emergency.availableQuickActions(a.emergency).forEach(it => btn(it.label, it.cmd, it.cls));
      }
      btn('V mín', 'V MIN', 'spd');
      btn('Vel. livre', 'V LIVRE', 'spd');
    }
    const wheelsOn = a.airborne || (a.kind === 'dep' && a.state !== 'rollout');
    const sig = a.cs + '|' + items.map(i => i.label + '~' + i.cmd + '~' + i.cls).join(';') + '|' + wheelsOn;
    if (sig !== quickSig) {
      quickSig = sig;
      const qb = $('quickBtns');
      qb.innerHTML = '';
      for (const it of items) {
        const b = document.createElement('button');
        b.textContent = it.label; b.className = it.cls;
        b.onclick = () => game.runCommand(a.cs + ' ' + it.cmd);
        qb.appendChild(b);
      }
      // roletas: em voo sempre; no solo só para saídas (autorizações pré-decolagem)
      $('wheelRow').style.display = wheelsOn ? '' : 'none';
    }
  }

  // ---------------- cartas ----------------
  function openCharts() {
    $('chartsModal').classList.remove('hidden');
    const list = $('chartList');
    list.innerHTML = '';
    const mk = (title, items, kind) => {
      const h = document.createElement('div'); h.className = 'chartGroup'; h.textContent = title; list.appendChild(h);
      for (const [id, p] of items) {
        const active = !game.started || p.cfg === game.cfg;
        const b = document.createElement('button');
        b.textContent = id + (active ? '' : ' (inativa)');
        b.className = active ? '' : 'dim';
        b.onclick = () => { drawChart(id, p, kind); list.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); };
        list.appendChild(b);
      }
    };
    mk('CHEGADAS (STAR)', Object.entries(DATA.STARS), 'star');
    mk('SAÍDAS (SID)', Object.entries(DATA.SIDS), 'sid');
    const first = Object.entries(DATA.STARS).find(([, p]) => p.cfg === game.cfg)
      || Object.entries(DATA.STARS)[0];
    if (first) { drawChart(first[0], first[1], 'star'); list.querySelectorAll('button')[0].classList.add('on'); }
  }

  function drawChart(id, proc, kind) {
    const cv = $('chartCanvas');
    const ctx = cv.getContext('2d');
    const W = cv.width = cv.clientWidth * 2, H = cv.height = cv.clientHeight * 2;
    ctx.fillStyle = '#f4efe4'; ctx.fillRect(0, 0, W, H); // papel de carta aeronáutica
    ctx.scale(2, 2);
    const w = W / 2, h = H / 2;

    const pts = kind === 'star' ? proc.route.map(r => U.fix(r.fix)) : proc.route.map(f => U.fix(f));
    const all = [...pts, [0, 0], [3, 3], [-3, -3]];
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const minX = Math.min(...xs) - 6, maxX = Math.max(...xs) + 6;
    const minY = Math.min(...ys) - 6, maxY = Math.max(...ys) + 6;
    const sc = Math.min((w - 60) / (maxX - minX), (h - 110) / (maxY - minY));
    const px = x => 30 + (x - minX) * sc + (w - 60 - (maxX - minX) * sc) / 2;
    const py = y => h - 70 - (y - minY) * sc - (h - 130 - (maxY - minY) * sc) / 2;

    // cabeçalho
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 15px Georgia, serif';
    ctx.fillText(`${DATA.AIRPORT.icao} — ${proc.name}`, 14, 22);
    ctx.font = '11px Georgia, serif';
    ctx.fillText(kind === 'star'
      ? 'Chegada padrão por instrumentos · Restrições: cruzar NO fixo na altitude/velocidade indicadas ("descer via")'
      : 'Saída padrão · Com "subir via SID": proa de pista até 900 ft AGL, então navega pelos fixos até o teto da carta', 14, 38);
    ctx.strokeStyle = '#1a1a2e'; ctx.strokeRect(6, 6, w - 12, h - 12);

    // aeroporto: pistas conforme o JSON carregado
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
    const drawnPairs = new Set();
    for (const [rid, rw] of Object.entries(DATA.RUNWAYS)) {
      const pair = DATA.RWY_PAIR[rid];
      if (drawnPairs.has(pair)) continue;
      drawnPairs.add(pair);
      const ex = rw.thr[0] + Math.sin(U.d2r(rw.hdg)) * rw.len;
      const ey = rw.thr[1] + Math.cos(U.d2r(rw.hdg)) * rw.len;
      ctx.beginPath(); ctx.moveTo(px(rw.thr[0]), py(rw.thr[1])); ctx.lineTo(px(ex), py(ey)); ctx.stroke();
    }
    ctx.fillStyle = '#333';
    ctx.font = 'bold 10px Georgia, serif';
    ctx.fillText(DATA.AIRPORT.icao, px(0) - 14, py(0) + 18);

    // rota
    ctx.strokeStyle = '#20206a'; ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(px(x), py(y)) : ctx.lineTo(px(x), py(y)));
    ctx.stroke();
    // setas
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
      const mx = px((x1 + x2) / 2), my = py((y1 + y2) / 2);
      const ang = Math.atan2(py(y2) - py(y1), px(x2) - px(x1));
      ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath();
      ctx.fillStyle = '#20206a'; ctx.fill(); ctx.restore();
    }

    // fixos + restrições
    ctx.lineWidth = 1.4;
    (kind === 'star' ? proc.route : proc.route.map(f => ({ fix: f }))).forEach((r, i) => {
      const [x, y] = U.fix(r.fix);
      const X = px(x), Y = py(y);
      ctx.strokeStyle = '#20206a'; ctx.fillStyle = '#20206a';
      ctx.beginPath(); ctx.moveTo(X, Y - 6); ctx.lineTo(X - 5, Y + 4); ctx.lineTo(X + 5, Y + 4); ctx.closePath(); ctx.stroke();
      ctx.font = 'bold 11px Georgia, serif';
      ctx.fillText(r.fix, X + 8, Y - 2);
      if (r.alt) {
        ctx.font = '10px Georgia, serif';
        ctx.fillStyle = '#8a2020';
        ctx.fillText((r.alt >= 10000 ? 'FL' + r.alt / 100 : r.alt.toLocaleString('pt-BR') + ' ft'), X + 8, Y + 10);
        if (r.spd) ctx.fillText(r.spd + ' kt', X + 8, Y + 21);
      }
    });

    // rodapé
    ctx.fillStyle = '#1a1a2e'; ctx.font = '10px Georgia, serif';
    const cfgLab = (DATA.CONFIGS[proc.cfg] && DATA.CONFIGS[proc.cfg].label) || 'Config ' + proc.cfg;
    ctx.fillText(`${cfgLab} · Uso exclusivo em simulação — ${DATA.AIRPORT.icao}`, 14, h - 14);
  }

  // ---------------- topo / status ----------------
  function refreshTop() {
    $('score').textContent = game.score;
    $('clockEl').textContent = game.clock() + 'Z';
    $('windEl').textContent = game.windStr();
    $('atisLetter').textContent = game.atisLetter();
    $('airportState').textContent = game.airportState.label || 'Normal';
    $('airportState').className = 'stat opstate ' + (game.airportState.state || 'normal');
    $('rankEl').textContent = game.rank();
    $('statLanded').textContent = game.stats.landed;
    $('statDeparted').textContent = game.stats.departed;
    $('statGA').textContent = game.stats.goarounds;
    $('statSep').textContent = game.stats.sepLoss;
  }

  function flashBanner(text, cls) {
    const b = $('banner');
    b.textContent = text;
    b.className = 'show ' + (cls || '');
    clearTimeout(flashBanner._t);
    flashBanner._t = setTimeout(() => b.className = '', 3500);
  }

  function init(g) {
    game = g;
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = loadVoices;

    // entrada de comandos
    const input = $('cmdInput');
    const history = [];
    let hIdx = -1;
    function transmit() {
      if (!input.value.trim()) return;
      game.runCommand(input.value);
      history.unshift(input.value); if (history.length > 30) history.pop();
      hIdx = -1;
      input.value = '';
      $('btnSend').classList.remove('pending');
      $('btnQuickSend').classList.remove('pending');
      wheelUnstage(); // roletas voltam a espelhar a autorização vigente
      if (isTouch) input.blur(); // fecha o teclado do sistema após transmitir
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') transmit();
      else if (e.key === 'ArrowUp') { if (hIdx < history.length - 1) input.value = history[++hIdx]; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (hIdx > 0) input.value = history[--hIdx]; else { hIdx = -1; input.value = ''; } e.preventDefault(); }
      else if (e.key === 'Escape') { input.value = ''; game.select(null); }
    });
    $('btnSend').onclick = transmit;
    $('btnQuickSend').onclick = transmit;
    for (const k of Object.keys(WHEELS)) attachWheel(k);
    // seleção preenche o callsign
    document.addEventListener('keydown', e => {
      if (e.target === input) return;
      if (e.key === 'Escape') { game.select(null); return; }
      if (e.key === 'p' || e.key === 'P') game.togglePause();
      if (/^[a-zA-Z0-9]$/.test(e.key)) { input.focus(); }
    });
    $('selClose').onclick = () => game.select(null);

    $('btnCharts').onclick = openCharts;
    $('btnHelp').onclick = () => $('helpModal').classList.remove('hidden');
    document.querySelectorAll('.modal .close').forEach(b => b.onclick = () => b.closest('.modal').classList.add('hidden'));
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }));

    $('btnPause').onclick = () => game.togglePause();
    document.querySelectorAll('#speedBtns button').forEach(b => b.onclick = () => {
      game.simSpeed = parseInt(b.dataset.s, 10);
      document.querySelectorAll('#speedBtns button').forEach(x => x.classList.toggle('on', x === b));
    });
    $('btnSound').classList.toggle('off', !game.settings.sound);
    $('btnTts').classList.toggle('off', !game.settings.tts);
    $('btnSound').onclick = () => { game.settings.sound = !game.settings.sound; $('btnSound').classList.toggle('off', !game.settings.sound); if (!game.settings.sound) setAlarm(false); game.savePrefs(); };
    $('btnTts').onclick = () => { game.settings.tts = !game.settings.tts; $('btnTts').classList.toggle('off', !game.settings.tts); if (!game.settings.tts) speechSynthesis.cancel(); game.savePrefs(); };
    $('btnCenter').onclick = () => Radar.fitView();

    // configurações de exibição (persistidas em localStorage)
    const setChk = (id, key) => {
      const el = $(id);
      el.checked = !!game.settings[key];
      el.onchange = () => { game.settings[key] = el.checked; game.savePrefs(); };
    };
    setChk('setTrailLine', 'trailLine');
    setChk('setSweep', 'sweep');
    setChk('setFixNames', 'fixNames');
    $('btnSettings').onclick = () => $('settingsModal').classList.remove('hidden');

    // sidebar recolhível (essencial no celular)
    const applySidebar = show => {
      $('sidebar').classList.toggle('hidden', !show);
      $('btnSidebar').classList.toggle('off', !show);
      window.dispatchEvent(new Event('resize'));
    };
    let sbOpen = window.innerWidth > 980; // começa fechada em telas pequenas
    applySidebar(sbOpen);
    $('btnSidebar').onclick = () => { sbOpen = !sbOpen; applySidebar(sbOpen); };

    // ATIS / METAR / pistas em uso
    $('atisBtn').onclick = () => { refreshAtisModal(); $('atisModal').classList.remove('hidden'); };

    // tela cheia (desktop e Android/Chrome)
    $('btnFull').onclick = () => {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      try {
        if (!document.fullscreenElement && req) {
          const p = req.call(el, { navigationUI: 'hide' });
          if (p && p.catch) p.catch(() => logSys('Tela cheia indisponível neste navegador.', 'bad'));
        } else if (document.fullscreenElement && exit) {
          exit.call(document);
        } else if (!req) {
          logSys('Tela cheia indisponível neste navegador.', 'bad');
        }
      } catch (e) {
        logSys('Tela cheia indisponível neste navegador.', 'bad');
      }
    };
    document.addEventListener('fullscreenchange', () => {
      $('btnFull').classList.toggle('on', !!document.fullscreenElement);
      window.dispatchEvent(new Event('resize'));
    });
  }

  function refreshAtisModal() {
    $('atisLetterBig').textContent = game.atisLetter();
    $('metarText').textContent = game.metar();
    const tw = game.tailwind();
    $('atisWarn').classList.toggle('hidden', tw < 8);
    if (tw >= 8) $('atisWarn').textContent =
      `⚠ Componente de cauda de ${Math.round(tw)} kt na pista ${DATA.CONFIGS[game.cfg].arrRwy} — considere trocar a configuração.`;
    const box = $('cfgSwitch');
    box.innerHTML = '';
    const mp = typeof Net !== 'undefined' && Net.active; // troca de pistas só no SP
    for (const [k, c] of Object.entries(DATA.CONFIGS)) {
      const b = document.createElement('button');
      const twK = game.tailwind(k);
      b.textContent = (k === game.cfg ? '● ' : '○ ') + c.label +
        `  (cauda ${twK > 0 ? Math.round(twK) : 0} kt)`;
      b.classList.toggle('on', k === game.cfg);
      b.disabled = mp;
      b.onclick = () => { game.setConfig(k); refreshAtisModal(); };
      box.appendChild(b);
    }
    if (mp) {
      const n = document.createElement('p');
      n.className = 'tiny';
      n.textContent = 'Troca de pistas em uso disponível apenas no single-player.';
      box.appendChild(n);
    }
  }

  // preenche a barra de comando com uma instrução pendente de confirmação
  function propose(text) {
    const input = $('cmdInput');
    input.value = text;
    $('btnSend').classList.add('pending');
    if (!isTouch) input.focus();
  }

  // fecha o teclado do sistema se estiver aberto (chamado ao tocar no radar)
  function dismissKeyboard() {
    if (isTouch && document.activeElement === $('cmdInput')) $('cmdInput').blur();
  }

  return { init, logATC, logPilot, logSys, logChat, refreshStrips, refreshSelPanel, refreshTop, setAlarm, chime, flashBanner, openCharts, propose, refreshAtisModal, dismissKeyboard, isTouch };
})();
