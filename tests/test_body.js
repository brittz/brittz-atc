// Teste de motor (avaliado após data.js/aircraft.js/commands.js no mesmo escopo)
DATA.setAirport(JSON.parse(fs.readFileSync(path.join(ROOT, 'airports/sbcv.json'), 'utf8')));

const events = [];
const game = {
  aircraft: [],
  selected: null,
  radioPilot: (ac, txt) => events.push(`[${ac.cs}] ${txt}`),
  touchdown: null,
  onGoAround: (ac, r) => events.push(`GA ${ac.cs}: ${r}`),
  runwayOccupied: () => false,
  windStr: () => '080/9',
  cardinal: brg => ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'][Math.round(U.norm360(brg) / 45) % 8],
};

let landed = false;
game.touchdown = ac => { landed = true; events.push(`TOUCHDOWN ${ac.cs} rwy ${ac.app.rwy}`); ac.state = 'rollout'; ac.alt = 0; };

// ---------- chegada: SABIA1, VIA, ILS 09L, AP ----------
const star = DATA.STARS.SABIA1;
const route = star.route.map(r => r.fix);
const entry = U.fix('SABIA');
const arr = new Aircraft({
  cs: 'TAM3412', radio: 'LATAM', type: 'A320', kind: 'arr',
  x: entry[0], y: entry[1], alt: 16000, spd: 290,
  hdg: U.brg(entry[0], entry[1], U.fix(route[1])[0], U.fix(route[1])[1]),
  star: 'SABIA1', nav: { mode: 'route', route, idx: 1 },
});
game.aircraft.push(arr);

console.log('VIA  ->', JSON.stringify(arr.cmdVia()));
console.log('ILS  ->', JSON.stringify(arr.cmdIls('09L')));
console.log('AP   ->', JSON.stringify(arr.cmdLand('09L')));

let t = 0, lastPhase = '', phaseLog = [];
while (t < 2400 && !landed) {
  arr.update(0.5, game);
  t += 0.5;
  const ph = `${arr.app.phase}/${arr.nav.mode}`;
  if (ph !== lastPhase) {
    phaseLog.push(`t=${Math.round(t)}s  fase=${ph}  alt=${Math.round(arr.alt)}  spd=${Math.round(arr.spd)}  pos=(${arr.x.toFixed(1)},${arr.y.toFixed(1)})`);
    lastPhase = ph;
  }
}
console.log(phaseLog.join('\n'));
console.log(landed ? `OK POUSO em t=${Math.round(t)}s (${(t/60).toFixed(1)} min)` : `FALHA NAO POUSOU: alt=${Math.round(arr.alt)} pos=(${arr.x.toFixed(1)},${arr.y.toFixed(1)}) app=${arr.app.phase} nav=${arr.nav.mode} hdg=${Math.round(arr.hdg)}`);

// ---------- decolagem: DEC 09R, subir, seguir SID ----------
let handoffDone = null;
game.completeHandoff = (ac, manual) => { handoffDone = { cs: ac.cs, manual }; ac.state = 'done'; };

const dep = new Aircraft({
  cs: 'GLO1234', radio: 'Gol', type: 'B738', kind: 'dep',
  state: 'holdshort', sid: 'CACTO1', dest: 'SBGR',
});
dep.rwy = '09R'; dep.clrAlt = 5000;
const rHS = DATA.RUNWAYS['09R'];
dep.x = rHS.thr[0]; dep.y = rHS.thr[1] - 0.18; dep.hdg = 90;
game.aircraft.push(dep);

// autorizacoes ainda no solo
console.log('ALTsolo ->', JSON.stringify(dep.cmdAlt(15000)));
console.log('VIAsolo ->', JSON.stringify(dep.cmdVia()));
console.log('HOcedo  ->', JSON.stringify(dep.cmdHandoff(game)));
console.log('DEC     ->', JSON.stringify(dep.cmdTakeoff('09R')));
let t2 = 0, airborneAt = null, earlyHoTested = false, hoOk = null;
while (t2 < 1200 && dep.state !== 'done') {
  dep.update(0.5, game);
  t2 += 0.5;
  if (dep.state === 'air' && airborneAt === null) airborneAt = t2;
  // tenta transferir cedo demais (a ~5000 ft, perto do aeroporto)
  if (dep.state === 'air' && dep.alt > 4000 && !earlyHoTested) {
    earlyHoTested = true;
    const r = dep.cmdHandoff(game);
    console.log('HOcedo2 ->', JSON.stringify(r), r.early ? '(alertou OK)' : '(FALHA: deveria alertar)');
  }
  // no momento certo
  if (dep.state === 'air' && dep.alt >= 9000 && dep.fixDist('CACTO') < 12 && !hoOk) {
    hoOk = dep.cmdHandoff(game);
    console.log('HOcerto ->', JSON.stringify(hoOk));
  }
}
console.log(`SID auto-engatada? nav percorreu rota: airborne t=${airborneAt}s fim t=${Math.round(t2)}s alt=${Math.round(dep.alt)}`);
console.log(handoffDone && handoffDone.manual && hoOk && hoOk.rb ? 'OK SAIDA (SID automatica + HO manual no momento certo)' : 'FALHA SAIDA ' + JSON.stringify(handoffDone));

// ---------- DEC simples deve manter a proa de pista (sem SID) ----------
const vRH = mkDep('GLO7010', 'CACTO1');
Commands.parse('GLO7010 DEC 09R', game);
let tRH = 0;
while (tRH < 300 && vRH.alt < 3000) { vRH.update(0.5, game); tRH += 0.5; }
console.log(`DEC simples: alt=${Math.round(vRH.alt)} nav=${vRH.nav.mode} hdg=${Math.round(vRH.hdg)}`);
console.log(vRH.nav.mode === 'hdg' && Math.round(vRH.hdg) === 90 ? 'OK DEC SIMPLES (proa de pista, sem SID)' : 'FALHA DEC SIMPLES');

// ---------- STAR em voo (reingresso) ----------
const arr2 = new Aircraft({
  cs: 'AZU4521', radio: 'Azul', type: 'E195', kind: 'arr',
  x: -30, y: 20, alt: 12000, spd: 280, hdg: 120,
  star: 'SABIA1', nav: { mode: 'hdg', hdg: 120, turn: null },
});
console.log('STARvoo ->', JSON.stringify(arr2.cmdStar('PEDRA1')), 'rota:', arr2.nav.route.join('>'));

// ---------- condicionais APOS + P fixo + aliases ----------
game.selected = null;
game.aircraft.push(arr2);
const execd = [];
game.execPending = (ac, p) => {
  const { results } = Commands.run(ac, p.tokens, game);
  execd.push({ cs: ac.cs, label: p.label, results });
};

// APOS fixo+dist com instrução de altitude
let pr = Commands.parse('AZU4521 APOS NORTE 5 A 6000', game);
console.log('APOSfix ->', pr.err || pr.atcText, '| rb:', JSON.stringify(pr.results.map(r => r.rb || r.err)));
// P para fixo (vetor)
let pr2 = Commands.parse('AZU4521 P TOLDO', game);
console.log('PFixo   ->', pr2.err || pr2.atcText);
// alias TKFF invalido no ar (mas parser reconhece)
let pr3 = Commands.parse('AZU4521 TKFF', game);
console.log('TKFFar  ->', JSON.stringify(pr3.results ? pr3.results[0] : pr3));
// APOS sem nada
let pr4 = Commands.parse('AZU4521 APOS A 5000', game);
console.log('APOSerr ->', pr4.err || 'FALHA: deveria dar erro');

// ---------- caso do usuario: DEC + APOS 7 DIR SERTA (nao pode virar antes) ----------
const dep2 = new Aircraft({
  cs: 'AZU3760', radio: 'Azul', type: 'A20N', kind: 'dep',
  state: 'holdshort', sid: 'DENDE1', dest: 'SBFL',
});
dep2.rwy = '09R'; dep2.clrAlt = 5000;
dep2.x = DATA.RUNWAYS['09R'].thr[0]; dep2.y = DATA.RUNWAYS['09R'].thr[1] - 0.18; dep2.hdg = 90;
game.aircraft.push(dep2);
const execd2 = [];
const savedExec = game.execPending;
game.execPending = (ac, p) => {
  const { results } = Commands.run(ac, p.tokens, game);
  execd2.push({ cs: ac.cs, at: U.dist(DATA.RUNWAYS['09R'].thr[0], DATA.RUNWAYS['09R'].thr[1], ac.x, ac.y).toFixed(1) });
};
const prD = Commands.parse('AZU3760 DEC 09R APOS 7 DIR SERTA A FL120', game);
console.log('DECcond ->', prD.err || prD.atcText, '| rb:', JSON.stringify(prD.results.map(r=>r.rb||r.err)));
let t4 = 0, maxHdgDev = 0, hdgAt3nm = null;
while (t4 < 600 && execd2.length === 0) {
  dep2.update(0.5, game);
  t4 += 0.5;
  if (dep2.airborne) {
    const dFromRwy = U.dist(DATA.RUNWAYS['09R'].thr[0], DATA.RUNWAYS['09R'].thr[1], dep2.x, dep2.y);
    if (dFromRwy > 1.5 && dFromRwy < 6.5) maxHdgDev = Math.max(maxHdgDev, Math.abs(U.adiff(90, dep2.hdg)));
    if (hdgAt3nm === null && dFromRwy >= 3) hdgAt3nm = Math.round(dep2.hdg);
  }
}
game.execPending = savedExec;
console.log(`Proa a 3NM=${hdgAt3nm} (esperado 090) · desvio max antes de 7NM=${Math.round(maxHdgDev)}° · disparou a ${execd2[0] ? execd2[0].at : '?'}NM · destino nav=${dep2.nav.mode==='route'?dep2.nav.route[dep2.nav.idx]:'?'} · clrAlt=${dep2.clrAlt}`);
console.log(hdgAt3nm === 90 && maxHdgDev < 5 && execd2.length && Math.abs(parseFloat(execd2[0].at) - 7) < 1 && dep2.clrAlt === 12000 ? 'OK PROA DE PISTA MANTIDA ATE 7NM -> DIR SERTA FL120' : 'FALHA CASO USUARIO');

// ---------- DEC + VIA (subir via SID) e DEC + AFTER 5 VIA ----------
function mkDep(cs, sidName) {
  const d = new Aircraft({ cs, radio: 'Gol', type: 'B738', kind: 'dep', state: 'holdshort', sid: sidName, dest: 'SBGR' });
  d.rwy = '09R'; d.clrAlt = 5000;
  d.x = DATA.RUNWAYS['09R'].thr[0]; d.y = DATA.RUNWAYS['09R'].thr[1] - 0.18; d.hdg = 90;
  game.aircraft.push(d);
  return d;
}
const prevExec = game.execPending;
game.execPending = (ac, p) => { Commands.run(ac, p.tokens, game); };

const v1 = mkDep('GLO7001', 'CACTO1');
const rv1 = Commands.parse('GLO7001 DEC 09R VIA', game);
console.log('DECVIA  ->', rv1.err || rv1.atcText, '| rb:', JSON.stringify(rv1.results.map(r=>r.rb||r.err)));
let tv1 = 0; while (tv1 < 300 && v1.alt < 6000) { v1.update(0.5, game); tv1 += 0.5; }
console.log(v1.clrAlt === 15000 ? 'OK DEC+VIA (subindo para o teto FL150 da SID)' : 'FALHA DEC+VIA clrAlt=' + v1.clrAlt);

const v2 = mkDep('GLO7002', 'CACTO1');
const rv2 = Commands.parse('GLO7002 DEC 09R AFTER 5 VIA', game);
console.log('DECAFT  ->', rv2.err || rv2.atcText, '| rb:', JSON.stringify(rv2.results.map(r=>r.rb||r.err)));
let tv2 = 0, clrAt5 = null;
while (tv2 < 600 && v2.pending.length) { v2.update(0.5, game); tv2 += 0.5; }
const d5 = U.dist(DATA.RUNWAYS['09R'].thr[0], DATA.RUNWAYS['09R'].thr[1], v2.x, v2.y);
console.log(`AFTER 5 VIA: disparou a ${d5.toFixed(1)}NM clrAlt=${v2.clrAlt} (antes era 5000)`);
console.log(v2.clrAlt === 15000 && Math.abs(d5 - 5) < 1 ? 'OK DEC+AFTER 5 VIA' : 'FALHA DEC+AFTER5VIA');

// ---------- RTO: abortar decolagem e taxiar de volta ----------
const v4 = mkDep('GLO7004', 'CACTO1');
Commands.parse('GLO7004 DEC 09R', game);
let t5 = 0;
while (t5 < 60 && v4.spd < 80) { v4.update(0.5, game); t5 += 0.5; } // acelera ate ~80kt
const rAb = Commands.parse('GLO7004 ABORTAR', game);
console.log('RTO     ->', rAb.err || rAb.atcText, '| rb:', JSON.stringify(rAb.results.map(r=>r.rb||r.err)));
while (t5 < 400 && v4.state !== 'holdshort') { v4.update(0.5, game); t5 += 0.5; }
console.log(v4.state === 'holdshort' && v4.rwy === '09R' ? 'OK RTO (parou e voltou ao ponto de espera)' : 'FALHA RTO state=' + v4.state);
// tarde demais (acima de V1)
const v5 = mkDep('GLO7005', 'CACTO1');
Commands.parse('GLO7005 DEC 09R', game);
let t6 = 0; while (t6 < 120 && v5.state === 'takeoff') { v5.update(0.5, game); t6 += 0.5; if (v5.spd > v5.perf.vr - 5) break; }
console.log('RTOv1   ->', JSON.stringify(v5.cmdAbort()), '(esperado erro acima de V1)');

// ---------- TAXI para outra cabeceira ----------
const v6 = mkDep('GLO7006', 'CACTO1');
const rTx = Commands.parse('GLO7006 TAXI 27L', game);
console.log('TAXI    ->', rTx.err || rTx.atcText, '| rb:', JSON.stringify(rTx.results.map(r=>r.rb||r.err)));
console.log(v6.state === 'taxi' && v6.rwy === '27L' && v6.sid === 'CACTO2' ? 'OK TAXI (27L, SID re-arquivada CACTO2)' : 'FALHA TAXI ' + v6.sid);

// ---------- V MIN ----------
const rMin = Commands.parse('AZU4521 V MIN', game);
console.log('VMIN    ->', rMin.err || rMin.atcText, '| rb:', JSON.stringify(rMin.results.map(r=>r.rb||r.err)), '| spdMode:', game.aircraft.find(a=>a.cs==='AZU4521').spdMode);

// ---------- APOS por altitude ----------
const v7 = mkDep('GLO7007', 'CACTO1');
const rAlt = Commands.parse('GLO7007 DEC 09R APOS 3000 V 280', game);
console.log('APOSalt ->', rAlt.err || rAlt.atcText, '| rb:', JSON.stringify(rAlt.results.map(r=>r.rb||r.err)));
const prevExec2 = game.execPending;
let firedAlt = null;
game.execPending = (ac, p) => { Commands.run(ac, p.tokens, game); firedAlt = Math.round(ac.alt); };
let t7 = 0; while (t7 < 400 && v7.pending.length) { v7.update(0.5, game); t7 += 0.5; }
game.execPending = prevExec2;
console.log(`APOS 3000: disparou a ${firedAlt} ft, clrSpd=${v7.clrSpd}`);
console.log(firedAlt && Math.abs(firedAlt - 3000) < 120 && v7.clrSpd === 280 ? 'OK APOS ALTITUDE' : 'FALHA APOS ALTITUDE');

// APOS FL na descida
const v8 = game.aircraft.find(a=>a.cs==='AZU4521');
const rFl = Commands.parse('AZU4521 APOS FL80 V 250', game);
console.log('APOSfl  ->', rFl.err || rFl.atcText);

// ---------- caso do usuario: TAKEOFF A 2000 DCT FAROL APOS FAROL A 5000 ----------
const v9 = mkDep('GLO7009', 'CACTO1');
const prevExec3 = game.execPending;
game.execPending = (ac, p) => { Commands.run(ac, p.tokens, game); };
const rU = Commands.parse('GLO7009 TAKEOFF A 2000 DCT FAROL APOS FAROL A 5000', game);
console.log('LINHA   ->', rU.err || rU.atcText, '| rb:', JSON.stringify(rU.results.map(r=>r.rb||r.err)));
let t9 = 0, maxAltBeforeFarol = 0, altAtFarol = null;
while (t9 < 900 && v9.pending.length) {
  v9.update(0.5, game);
  t9 += 0.5;
  if (v9.airborne && v9.fixDist('FAROL') > 1.5) maxAltBeforeFarol = Math.max(maxAltBeforeFarol, v9.alt);
  if (altAtFarol === null && v9.fixDist('FAROL') < 1) altAtFarol = Math.round(v9.alt);
}
// depois da condicional, deve subir para 5000
let t10 = 0; while (t10 < 300 && v9.alt < 4900) { v9.update(0.5, game); t10 += 0.5; }
game.execPending = prevExec3;
console.log(`nivelou em ${Math.round(maxAltBeforeFarol)} ft antes de FAROL · em FAROL=${altAtFarol} ft · clrAlt final=${v9.clrAlt} · alt final=${Math.round(v9.alt)}`);
console.log(maxAltBeforeFarol <= 2100 && v9.clrAlt === 5000 && v9.alt >= 4900 ? 'OK CASO USUARIO (2000 ate FAROL, depois 5000)' : 'FALHA CASO USUARIO');

// ---------- helicoptero: reporta, paira no limite da ATZ, cruza com CRZ ----------
let heliScored = null;
game.onHeliCrossed = ac => { heliScored = ac.cs; };
function mkHeli(cs, x, y, exit) {
  const h = new Aircraft({ cs, radio: 'Helicóptero ' + cs, type: 'H125', kind: 'hel', x, y, alt: 2000, spd: 100, hdg: U.brg(x, y, exit[0], exit[1]) });
  h.clrAlt = 2000; h.wptExit = exit; h.heliAuto = true; h.heliState = 'inbound';
  h.crossRequested = false; h.crossCleared = false; h.zoneEntered = false;
  game.aircraft.push(h);
  return h;
}
const h1 = mkHeli('PR-TST', 22, 0, [-22, 0]);
let th1 = 0, hoverD = null;
while (th1 < 1800 && !(h1.heliState === 'waiting' && h1.spd < 3)) { h1.update(0.5, game); th1 += 0.5; }
hoverD = U.dist(0, 0, h1.x, h1.y);
console.log(`HELI: pediu cruzamento? ${h1.crossRequested} · pairando a ${hoverD.toFixed(1)}NM spd=${Math.round(h1.spd)}`);
const rCrz = Commands.parse('PR-TST CRZ', game);
console.log('CRZ     ->', rCrz.err || rCrz.atcText, '| rb:', JSON.stringify(rCrz.results.map(r=>r.rb||r.err)));
while (th1 < 3600 && h1.state !== 'done') { h1.update(0.5, game); th1 += 0.5; }
console.log(h1.crossRequested && hoverD > 4.3 && hoverD < 5.6 && heliScored === 'PR-TST' && h1.state === 'done'
  ? 'OK HELI (reportou, pairou no limite, cruzou autorizado e saiu)' : `FALHA HELI hover=${hoverD} scored=${heliScored} state=${h1.state}`);

// autorizado ANTES da zona: nao para
const h2 = mkHeli('PR-LIV', 0, 22, [0, -22]);
Commands.parse('PR-LIV CRZ', game);
let th2 = 0, minSpd = 999;
while (th2 < 3600 && h2.state !== 'done') { h2.update(0.5, game); th2 += 0.5; if (h2.airborne) minSpd = Math.min(minSpd, h2.spd); }
console.log(minSpd > 60 && h2.state === 'done' ? `OK HELI PRE-AUTORIZADO (nao parou, vel minima ${Math.round(minSpd)}kt)` : `FALHA HELI2 minSpd=${Math.round(minSpd)} state=${h2.state}`);

// ---------- Position report system ----------
events.length = 0;
const rptDist = new Aircraft({
  cs: 'AZU5511', radio: 'Azul', type: 'E195', kind: 'arr',
  x: 0, y: -12, alt: 3000, spd: 180, hdg: 0,
  nav: { mode: 'hdg', hdg: 0, turn: null },
});
game.aircraft.push(rptDist);
const rrDist = Commands.parse('AZU5511 REPORTE 5', game);
let trd = 0;
while (trd < 900 && rptDist.reports.length) { rptDist.update(0.5, game); trd += 0.5; }
const distMsg = events.find(e => e.includes('[AZU5511]') && e.includes('5 milhas ao sul do aeródromo'));
console.log('REPDIST ->', rrDist.err || rrDist.atcText, '| evento:', distMsg || '(nenhum)');
console.log(rrDist && rrDist.ok !== false && !rptDist.reports.length && distMsg
  ? 'OK REPORTE DISTÂNCIA'
  : 'FALHA REPORTE DISTÂNCIA');

events.length = 0;
const norte = U.fix('NORTE');
const rptFix = new Aircraft({
  cs: 'AZU5512', radio: 'Azul', type: 'E195', kind: 'arr',
  x: norte[0] - 4, y: norte[1], alt: 4000, spd: 170, hdg: 90,
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
game.aircraft.push(rptFix);
const rrFix = Commands.parse('AZU5512 REPORTE NORTE', game);
let trf = 0;
while (trf < 600 && rptFix.reports.length) { rptFix.update(0.5, game); trf += 0.5; }
const fixMsg = events.find(e => e.includes('[AZU5512]') && e.includes('sobre NORTE'));
console.log('REPFIX  ->', rrFix.err || rrFix.atcText, '| evento:', fixMsg || '(nenhum)');
console.log(!rptFix.reports.length && fixMsg ? 'OK REPORTE FIXO' : 'FALHA REPORTE FIXO');

events.length = 0;
const rptAlt = mkDep('GLO7011', 'CACTO1');
const rrAltRep = Commands.parse('GLO7011 A 7000 REPORTE DEIXANDO 5000 DEC 09R', game);
let tra = 0;
while (tra < 900 && rptAlt.reports.length) { rptAlt.update(0.5, game); tra += 0.5; }
const altMsg = events.find(e => e.includes('[GLO7011]') && e.includes('deixando 5.000 pés'));
console.log('REPALT  ->', rrAltRep.err || rrAltRep.atcText, '| evento:', altMsg || '(nenhum)');
console.log(!rptAlt.reports.length && altMsg ? 'OK REPORTE ALTITUDE' : 'FALHA REPORTE ALTITUDE');

events.length = 0;
const rptFl = new Aircraft({
  cs: 'GLO7012', radio: 'Gol', type: 'B738', kind: 'dep',
  x: -6, y: -2, alt: 6000, spd: 220, hdg: 90,
  state: 'air', nav: { mode: 'hdg', hdg: 90, turn: null },
});
rptFl.clrAlt = 8000;
game.aircraft.push(rptFl);
const rrFlRep = Commands.parse('GLO7012 REPORTE NIVELADO FL080', game);
let trl = 0;
while (trl < 900 && rptFl.reports.length) { rptFl.update(0.5, game); trl += 0.5; }
const flMsg = events.find(e => e.includes('[GLO7012]') && e.includes('nivelado em FL080'));
console.log('REPFL   ->', rrFlRep.err || rrFlRep.atcText, '| evento:', flMsg || '(nenhum)');
console.log(!rptFl.reports.length && flMsg ? 'OK REPORTE NÍVEL' : 'FALHA REPORTE NÍVEL');

events.length = 0;
const h3 = mkHeli('PR-REP', 22, 0, [-22, 0]);
Commands.parse('PR-REP REPORTE 5', game);
let th3 = 0;
while (th3 < 2400 && !(h3.heliState === 'waiting' && h3.spd < 3)) { h3.update(0.5, game); th3 += 0.5; }
const rep5Msg = events.find(e => e.includes('[PR-REP]') && e.includes('5 milhas ao leste do aeródromo'));
const holdMsg = events.find(e => e.includes('[PR-REP]') && e.includes('mantendo posição fora da zona'));
console.log('REPHELI ->', rep5Msg || '(sem reporte)', '| espera:', holdMsg || '(sem chamada redundante)');
console.log(rep5Msg && !holdMsg ? 'OK REPORTE HELICÓPTERO (sem chamada redundante)' : 'FALHA REPORTE HELICÓPTERO');

// VIA em chegada continua ok? (regressao)
const v3 = new Aircraft({ cs:'TAM7003', radio:'LATAM', type:'A320', kind:'arr', x:-40, y:42, alt:16000, spd:290, hdg:120, star:'SABIA1', nav:{mode:'route', route:DATA.STARS.SABIA1.route.map(r=>r.fix), idx:1} });
console.log('VIAarr  ->', JSON.stringify(v3.cmdVia()));
game.execPending = prevExec;

// voa ate disparar a condicional (rota passa por NORTE)
Commands.parse('AZU4521 DIR NORTE', game);
let t3 = 0;
while (t3 < 900 && execd.length === 0) { arr2.update(0.5, game); t3 += 0.5; }
const distNorte = arr2.fixDist('NORTE');
console.log(`Condicional disparou? ${execd.length ? 'SIM' : 'NAO'} t=${Math.round(t3)}s distNORTE=${distNorte.toFixed(1)}NM clrAlt=${arr2.clrAlt}`);
console.log(execd.length && Math.abs(distNorte - 5) < 1 && arr2.clrAlt === 6000 ? 'OK CONDICIONAL (5NM apos NORTE -> 6000)' : 'FALHA CONDICIONAL ' + JSON.stringify(execd));

console.log('\n--- eventos de radio ---');
console.log(events.join('\n'));

// ---------- Emergências 2.0: fluxo, evolução e estado operacional ----------
const airportJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'airports/sbcv.json'), 'utf8'));
const emgEvents = [];
const core = new GameCore(airportJson, {
  cfg: '09',
  traffic: 'calmo',
  emit: ev => emgEvents.push(ev),
});
const emgAc = core.aircraft.find(a => a.kind === 'arr');
core.startEmergency(emgAc, 'engine-failure', { severity: 'high' });
console.log('EMGdecl ->', emgAc.emergency && emgAc.emergency.title, '| estado aeroporto:', core.airportState.state);
core.runCommand(emgAc.cs + ' NATURE SOULS FUEL INTENTIONS RWY STATUS');
core.handleEmergencyState(emgAc);
console.log('EMGflux ->', emgAc.emergency.stage, '| runway:', emgAc.emergency.info.runway, '| fuel:', emgAc.emergency.info.fuelMin);
console.log(core.airportState.state === 'emergency' && ['assessed', 'coordinating'].includes(emgAc.emergency.stage)
  ? 'OK EMERG FLUXO (declaração + perguntas em etapas + estado operacional)'
  : 'FALHA EMERG FLUXO');

// progressão completa: vetoração -> aproximação -> pouso -> pós-pouso -> encerramento
emgAc.nav = { mode: 'hdg', hdg: 110, turn: null };
core.handleEmergencyState(emgAc);
const stVector = emgAc.emergency.stage;
emgAc.cmdIls('09L');
core.handleEmergencyState(emgAc);
const stApproach = emgAc.emergency.stage;
emgAc.cmdLand('09L');
core.handleEmergencyState(emgAc);
const stLanding = emgAc.emergency.stage;
core.touchdown(emgAc);
const stPost = emgAc.emergency.stage;
const depHold = new Aircraft({
  cs: 'GLO9911', radio: 'Gol', type: 'B738', kind: 'dep',
  state: 'holdshort', sid: 'CACTO1', dest: 'SBGR',
});
depHold.rwy = '09R'; depHold.x = DATA.RUNWAYS['09R'].thr[0]; depHold.y = DATA.RUNWAYS['09R'].thr[1] - 0.18; depHold.hdg = 90;
const depBlocked = depHold.cmdTakeoff('09R', core);
emgAc.state = 'done';
core.onRunwayVacated(emgAc);
core.syncAirportState();
console.log('EMGfull ->', stVector, stApproach, stLanding, stPost, '| depBlocked:', depBlocked.err || depBlocked.rb, '| airport:', core.airportState.state);
console.log(stVector === 'vectoring' && stApproach === 'approach' && stLanding === 'landing' && stPost === 'post-landing' &&
  depBlocked.err && core.airportState.state === 'recovery'
  ? 'OK EMERG FLUXO COMPLETO (vetoração, aproximação, pouso, pós-pouso, recuperação e impacto no aeroporto)'
  : 'FALHA EMERG FLUXO COMPLETO');

// piora: bird strike -> engine failure
const evoAc = core.aircraft.find(a => a.kind === 'dep') || core.aircraft[0];
evoAc.emergency = Emergency.create('bird-strike', evoAc, core, {});
evoAc.emergency.nextReviewAt = core.time;
const savedRandom = Math.random;
let seq = [0.5, 1, 0, 0.5];
Math.random = () => (seq.length ? seq.shift() : 0.5);
core.handleEmergencyState(evoAc);
Math.random = savedRandom;
console.log('EMGevoW ->', evoAc.emergency.kind, evoAc.emergency.evolution);
console.log(evoAc.emergency.kind === 'engine-failure'
  ? 'OK EMERG EVOLUÇÃO (bird strike piorou para falha de motor)'
  : 'FALHA EMERG EVOLUÇÃO');

// melhora/estabilização
const impAc = core.aircraft.find(a => a !== evoAc && a.kind === 'arr') || core.aircraft[0];
impAc.emergency = Emergency.create('cabin-smoke', impAc, core, { severity: 'high' });
impAc.emergency.nextReviewAt = core.time;
seq = [0.5, 0, 1, 0.5];
Math.random = () => (seq.length ? seq.shift() : 0.5);
core.handleEmergencyState(impAc);
Math.random = savedRandom;
console.log('EMGevoI ->', impAc.emergency.severity, impAc.emergency.evolution);
console.log(impAc.emergency.evolution === 'improving'
  ? 'OK EMERG ESTABILIZAÇÃO (fumaça melhorou)'
  : 'FALHA EMERG ESTABILIZAÇÃO');

// fechamento -> recuperação
core.finishEmergency(evoAc, 'encerramento', '');
core.finishEmergency(impAc, 'encerramento', '');
core.syncAirportState();
console.log('EMGrecov ->', core.airportState.state, 'até', Math.round(core.recoveryUntil));
console.log(core.airportState.state === 'recovery'
  ? 'OK ESTADO OPERACIONAL (recuperação após encerramento)'
  : 'FALHA ESTADO OPERACIONAL');

// iniciativas gerais dos pilotos fora da emergência
const aiCore = new GameCore(airportJson, { cfg: '09', traffic: 'calmo', emit: () => {} });
aiCore.pendingRadio = [];
const aiArr = new Aircraft({
  cs: 'AZU9001', radio: 'Azul', type: 'A20N', kind: 'arr',
  x: -18, y: 8, alt: 12000, spd: 250, hdg: 120,
  star: 'SABIA1', nav: { mode: 'route', route: DATA.STARS.SABIA1.route.map(r => r.fix), idx: 1 },
  spawnT: 0, pilotAi: { nextAt: 0, askedVectors: false, askedCenter: false, askedHold: false },
});
const aiDep = new Aircraft({
  cs: 'GLO9002', radio: 'Gol', type: 'B738', kind: 'dep',
  x: U.fix('CACTO')[0] - 2, y: U.fix('CACTO')[1], alt: 9200, spd: 260, hdg: 90,
  sid: 'CACTO1', nav: { mode: 'route', route: DATA.SIDS.CACTO1.route.slice(), idx: 0 },
  spawnT: 0, pilotAi: { nextAt: 0, askedVectors: false, askedCenter: false, askedHold: false },
});
aiCore.time = 500;
aiCore.maybePilotInitiative(aiArr);
aiCore.maybePilotInitiative(aiDep);
const aiTexts = aiCore.pendingRadio.map(m => m.text).join(' | ');
console.log('AIpilot ->', aiTexts);
console.log(/descida|aproximação/.test(aiTexts) && /transferência ao Centro/.test(aiTexts)
  ? 'OK IA PILOTOS (iniciativa fora das emergências)'
  : 'FALHA IA PILOTOS');
