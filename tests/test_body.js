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
while (t5 < 200 && v4.spd > 20) { v4.update(0.5, game); t5 += 0.5; } // freia na pista
console.log(v4.state === 'abort' && !v4.vacateClr ? 'OK RTO AGUARDA LIVRAR (parado na pista)' : 'FALHA RTO aguardando state=' + v4.state + ' vacateClr=' + v4.vacateClr);
const rVac = Commands.parse('GLO7004 LIVRAR', game);
console.log('LIVRAR  ->', rVac.err || rVac.atcText, '| rb:', JSON.stringify(rVac.results.map(r=>r.rb||r.err)));
while (t5 < 400 && v4.state !== 'holdshort') { v4.update(0.5, game); t5 += 0.5; }
console.log(v4.state === 'holdshort' && v4.rwy === '09R' ? 'OK RTO (parou e voltou ao ponto de espera)' : 'FALHA RTO state=' + v4.state);
// tarde demais (acima de V1)
const v5 = mkDep('GLO7005', 'CACTO1');
Commands.parse('GLO7005 DEC 09R', game);
let t6 = 0; while (t6 < 120 && v5.state === 'takeoff') { v5.update(0.5, game); t6 += 0.5; if (v5.spd > v5.perf.vr - 5) break; }
console.log('RTOv1   ->', JSON.stringify(v5.cmdAbort()), '(esperado erro acima de V1)');

// ---------- LIVRAR: fraseologia pt/en e rollout ----------
const vLine = mkDep('GLO7090', 'CACTO1');
Commands.parse('GLO7090 ALINHAR 09R', game);
const rLivLine = Commands.parse('GLO7090 LIVRE A PISTA PELA PROXIMA', game);
console.log('LIVline ->', rLivLine.err || rLivLine.atcText, '| rb:', JSON.stringify(rLivLine.results.map(r=>r.rb||r.err)), '| state:', vLine.state);
console.log(vLine.state === 'taxi' && !rLivLine.err ? 'OK LIVRAR ALINHADA (pt)' : 'FALHA LIVRAR ALINHADA');

const vRoll = new Aircraft({
  cs: 'TAM7091', radio: 'LATAM', type: 'A320', kind: 'arr',
  state: 'rollout', rwy: '09L', spd: 40, alt: 0, hdg: 90,
  x: DATA.RUNWAYS['09L'].thr[0], y: DATA.RUNWAYS['09L'].thr[1],
  timer: 6, vacateClr: false,
});
game.aircraft.push(vRoll);
game.onRunwayVacated = ac => events.push('VACATED ' + ac.cs);
let tRoll = 0;
while (tRoll < 30 && vRoll.spd > 25) { vRoll.update(0.5, game); tRoll += 0.5; }
const stillWaiting = vRoll.state === 'rollout' && !vRoll.vacateClr;
const rVacEn = Commands.parse('TAM7091 VACATE RUNWAY LEFT', game);
console.log('LIVroll ->', rVacEn.err || rVacEn.atcText, '| waiting?', stillWaiting, '| vacateClr:', vRoll.vacateClr);
while (tRoll < 80 && vRoll.state !== 'done') { vRoll.update(0.5, game); tRoll += 0.5; }
console.log(stillWaiting && vRoll.state === 'done' && events.some(e => e === 'VACATED TAM7091')
  ? 'OK LIVRAR ROLLOUT (en, aguardou autorização)'
  : 'FALHA LIVRAR ROLLOUT state=' + vRoll.state);

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
const flMsg = events.find(e => e.includes('[GLO7012]') && e.includes('nivelado em FL80'));
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

// ---------- parser natural pt/en + abreviações ----------
function mkNatArr(cs) {
  const a = new Aircraft({
    cs, radio: 'Azul', type: 'A20N', kind: 'arr',
    x: -12, y: 10, alt: 12000, spd: 240, hdg: 90,
    star: 'SABIA1', nav: { mode: 'hdg', hdg: 90, turn: null },
  });
  game.aircraft.push(a);
  return a;
}
const natAlt = mkNatArr('AZU5530');
const natAltRes = Commands.parse('AZU5530 CLIMB TO FL170', game);
console.log('NATalt  ->', natAltRes.err || natAltRes.atcText, '| clrAlt:', natAlt.clrAlt);
console.log(!natAltRes.err && natAlt.clrAlt === 17000 && /suba para FL170/.test(natAltRes.atcText) ? 'OK NAT ALT PT/EN' : 'FALHA NAT ALT');

const natSpd = mkNatArr('AZU5531');
const natSpdRes = Commands.parse('AZU5531 MAINTAIN SPEED 220 KNOTS', game);
console.log('NATspd  ->', natSpdRes.err || natSpdRes.atcText, '| clrSpd:', natSpd.clrSpd);
console.log(!natSpdRes.err && natSpd.clrSpd === 220 && /220 nós/.test(natSpdRes.atcText) ? 'OK NAT SPEED PT/EN' : 'FALHA NAT SPEED');

const natHdg = mkNatArr('AZU5532');
const natHdgRes = Commands.parse('AZU5532 HEADING 270', game);
console.log('NAThdg  ->', natHdgRes.err || natHdgRes.atcText, '| nav:', natHdg.nav.hdg);
console.log(!natHdgRes.err && natHdg.nav.mode === 'hdg' && natHdg.nav.hdg === 270 ? 'OK NAT HDG PT/EN' : 'FALHA NAT HDG');

const natDir = mkNatArr('AZU5533');
const natDirRes = Commands.parse('AZU5533 PROCEED DIRECT GOMES', game);
console.log('NATdir  ->', natDirRes.err || natDirRes.atcText, '| nav:', natDir.nav.mode, natDir.nav.route && natDir.nav.route[0]);
console.log(!natDirRes.err && natDir.nav.mode === 'route' && natDir.nav.route[0] === 'GOMES' ? 'OK NAT DIRECT PT/EN' : 'FALHA NAT DIRECT');

const natLand = mkNatArr('AZU5534');
natLand.app = { phase: 'loc', rwy: '09L' };
const natLandRes = Commands.parse('AZU5534 CLEARED TO LAND RUNWAY 09L', game);
console.log('NATland ->', natLandRes.err || natLandRes.atcText, '| landClr:', natLand.landClr);
console.log(!natLandRes.err && natLand.landClr ? 'OK NAT LAND PT/EN' : 'FALHA NAT LAND');

const natCond = mkDep('GLO7030', 'CACTO1');
const natCondRes = Commands.parse('GLO7030 AO ATINGIR FL120 REDUZA PARA 250 NOS', game);
console.log('NATcond ->', natCondRes.err || natCondRes.atcText, '| pending:', natCond.pending[0] && natCond.pending[0].altMode, natCond.pending[0] && natCond.pending[0].tokens.join(' '));
console.log(!natCondRes.err && natCond.pending.length === 1 && natCond.pending[0].alt === 12000 && natCond.pending[0].altMode === 'reaching' && natCond.pending[0].tokens[0] === 'V'
  ? 'OK NAT COND ATINGINDO'
  : 'FALHA NAT COND ATINGINDO');

const natLevel = mkNatArr('AZU5535');
const natLevelRes = Commands.parse('AZU5535 NIVELADO FL080 MANTENHA VELOCIDADE MINIMA', game);
console.log('NATlvl  ->', natLevelRes.err || natLevelRes.atcText, '| pending:', natLevel.pending[0] && natLevel.pending[0].altMode, natLevel.pending[0] && natLevel.pending[0].tokens.join(' '));
console.log(!natLevelRes.err && natLevel.pending.length === 1 && natLevel.pending[0].alt === 8000 && natLevel.pending[0].altMode === 'level' && natLevel.pending[0].tokens.join(' ') === 'V MIN'
  ? 'OK NAT COND NIVELADO'
  : 'FALHA NAT COND NIVELADO');

const natVia = mkDep('GLO7031', 'CACTO1');
const natViaRes = Commands.parse('GLO7031 CLEARED VIA SID', game);
console.log('NATvia  ->', natViaRes.err || natViaRes.atcText, '| depViaSid:', natVia.depViaSid, '| clrAlt:', natVia.clrAlt);
console.log(!natViaRes.err && natVia.depViaSid && natVia.clrAlt === 15000 ? 'OK NAT VIA SID' : 'FALHA NAT VIA SID');

// voa ate disparar a condicional (rota passa por NORTE)
arr2.pending = arr2.pending.filter(p => /NORTE/.test(p.label));
execd.length = 0;
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
core.aircraft.push(depHold);
const depParallel = depHold.cmdTakeoff('09R', core); // paralela N/S — deve liberar
const depSameRwy = new Aircraft({
  cs: 'TAM9912', radio: 'LATAM', type: 'A320', kind: 'dep',
  state: 'holdshort', sid: 'CACTO1', dest: 'SBSP',
});
depSameRwy.rwy = '09L'; depSameRwy.x = DATA.RUNWAYS['09L'].thr[0]; depSameRwy.y = DATA.RUNWAYS['09L'].thr[1] - 0.18; depSameRwy.hdg = 90;
core.aircraft.push(depSameRwy);
const depSameBlocked = depSameRwy.cmdTakeoff('09L', core); // mesma faixa da emergência — bloqueia
emgAc.state = 'done';
core.onRunwayVacated(emgAc);
core.syncAirportState();
console.log('EMGfull ->', stVector, stApproach, stLanding, stPost,
  '| parallelOk:', !depParallel.err, '| sameBlocked:', !!depSameBlocked.err, '| airport:', core.airportState.state);
console.log(stVector === 'vectoring' && stApproach === 'approach' && stLanding === 'landing' && stPost === 'post-landing' &&
  !depParallel.err && depSameBlocked.err && core.airportState.state === 'recovery'
  ? 'OK EMERG FLUXO COMPLETO (vetoração, aproximação, pouso, pós-pouso, recuperação; paralela livre, mesma faixa retida)'
  : 'FALHA EMERG FLUXO COMPLETO ' + JSON.stringify({
    stVector, stApproach, stLanding, stPost,
    parallel: depParallel.err || depParallel.rb,
    same: depSameBlocked.err || depSameBlocked.rb,
    airport: core.airportState.state,
  }));

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

// elegibilidade contextual para sorteio aleatório
const farGearAc = new Aircraft({
  cs: 'TST4001', radio: 'Teste', type: 'A320', kind: 'arr',
  x: 0, y: -40, alt: 11000, spd: 250, hdg: 0,
  nav: { mode: 'route', route: ['FAROL'], idx: 0 }, spawnT: 0,
});
const nearGearAc = new Aircraft({
  cs: 'TST4002', radio: 'Teste', type: 'A320', kind: 'arr',
  x: 0, y: -12, alt: 5000, spd: 190, hdg: 0,
  nav: { mode: 'hdg', hdg: 0, turn: null }, spawnT: 0,
});
const depGearAc = new Aircraft({
  cs: 'TST4003', radio: 'Teste', type: 'B738', kind: 'dep',
  x: 4, y: 0, alt: 3000, spd: 190, hdg: 90,
  nav: { mode: 'hdg', hdg: 90, turn: null }, spawnT: core.time - 90,
});
const farKinds = Emergency.randomKindsFor(farGearAc, core);
const nearKinds = Emergency.randomKindsFor(nearGearAc, core);
const depKinds = Emergency.randomKindsFor(depGearAc, core);
console.log('EMGctx  -> far landing-gear?', farKinds.includes('landing-gear'), '| near?', nearKinds.includes('landing-gear'), '| dep?', depKinds.includes('landing-gear'));
console.log(!farKinds.includes('landing-gear') && nearKinds.includes('landing-gear') && depKinds.includes('landing-gear')
  ? 'OK EMERG CONTEXTO (trem de pouso só entra perto/na fase plausível)'
  : 'FALHA EMERG CONTEXTO');

// ---------- Airport Emergency Response: despacho, pista, encerramento ----------
const aerCore = new GameCore(airportJson, { cfg: '09', traffic: 'calmo', emit: () => {} });
const aerAc = aerCore.aircraft.find(a => a.kind === 'arr');
aerCore.startEmergency(aerAc, 'engine-fire', { severity: 'critical' });
const rDispFire = Commands.parse(aerAc.cs + ' ACIONE BOMBEIROS', aerCore);
const rDispFull = Commands.parse(aerAc.cs + ' DISPATCH FULL', aerCore);
const unitsAfter = (aerCore.emergencyResponse.units || []).filter(u => u.targetCs === aerAc.cs);
const phasesDispatch = unitsAfter.map(u => u.phase);
console.log('AERdisp ->', rDispFire.err || rDispFire.atcText, '| units:', unitsAfter.length, phasesDispatch.join(','));
console.log(!rDispFire.err && !rDispFull.err && unitsAfter.length >= 1 &&
  unitsAfter.some(u => u.type === 'arff' && u.phase !== 'at_base')
  ? 'OK AER DESPACHO (bombeiros/operação completa → unidades ativas)'
  : 'FALHA AER DESPACHO');

// avanço até staging
let taer = 0;
while (taer < 60) {
  aerCore.tick(0.5);
  taer += 0.5;
  if (unitsAfter.some(u => u.phase === 'staging')) break;
}
const staged = (aerCore.emergencyResponse.units || []).some(u => u.targetCs === aerAc.cs && u.phase === 'staging');
console.log('AERstg  -> staging?', staged, 't=', Math.round(taer));
console.log(staged ? 'OK AER STAGING (unidades no ponto de espera da pista)' : 'FALHA AER STAGING');

// bloqueio de pista com aeronave imobilizada (fogo)
aerAc.nav = { mode: 'hdg', hdg: 90, turn: null };
aerAc.cmdIls('09L');
aerAc.cmdLand('09L');
aerCore.touchdown(aerAc);
aerAc.spd = 0;
const vacRefuse = aerAc.cmdVacate(null);
const rwyBlocked = RunwayState.isUnavailable(aerCore.runwayMgr, '09L', aerCore);
const landBlock = aerCore.runwayOccupied('09L', aerAc);
console.log('AERblk  -> vacate:', vacRefuse.err || vacRefuse.rb, '| blocked?', rwyBlocked, '| occupied?', landBlock);
console.log(vacRefuse.err && rwyBlocked && landBlock
  ? 'OK AER BLOQUEIO (imobilizada, LIVRAR recusado, pista indisponível)'
  : 'FALHA AER BLOQUEIO');

// encerrar cedo deve falhar enquanto imobilizada
const rEndEarly = Commands.parse(aerAc.cs + ' ENCERRAR EMERGENCIA', aerCore);
console.log('AERendE ->', rEndEarly.results && (rEndEarly.results[0].err || rEndEarly.results[0].rb));
console.log(rEndEarly.results && rEndEarly.results[0].err
  ? 'OK AER ENCERRAR CEDO (recusado com aeronave na pista)'
  : 'FALHA AER ENCERRAR CEDO');

// simula serviço concluído → permite livrar → vacate → encerrar
aerAc.emergency.flags = aerAc.emergency.flags || {};
aerAc.emergency.flags.vacateAllowedAfterResponse = true;
for (const u of aerCore.emergencyResponse.units.filter(x => x.targetCs === aerAc.cs)) {
  u.phase = 'returning';
  EmergencyUnits.recall(u);
}
RunwayState.startInspection(aerCore.runwayMgr, '09L', aerCore.time + 5);
const vacOk = aerAc.cmdVacate(null);
aerAc.state = 'done';
aerCore.onRunwayVacated(aerAc);
aerCore.syncAirportState();
const closedOrRecovery = !aerAc.emergency.active || aerCore.airportState.state === 'recovery';
console.log('AERend  -> vacate ok?', !vacOk.err, '| active?', aerAc.emergency.active, '| airport:', aerCore.airportState.state);
console.log(!vacOk.err && closedOrRecovery
  ? 'OK AER ENCERRAMENTO (após serviço, livrar e recovery)'
  : 'FALHA AER ENCERRAMENTO');

// snapshot inclui unidades/pistas
const snap = aerCore.serialize();
console.log('AERsnap -> units', (snap.emergencyUnits || []).length, '| runwayStates', !!snap.runwayStates);
console.log(snap.emergencyUnits && snap.runwayStates && snap.emergencyResponse
  ? 'OK AER SNAPSHOT (emergencyUnits + runwayStates + emergencyResponse)'
  : 'FALHA AER SNAPSHOT');

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

// ---------- standby / previsão ATC ----------
const sbAc = new Aircraft({
  cs: 'AZU9100', radio: 'Azul', type: 'A20N', kind: 'arr',
  x: -10, y: 5, alt: 8000, spd: 220, hdg: 90,
  nav: { mode: 'hdg', hdg: 90, turn: null },
  pilotAi: { nextAt: 0, pendingAsk: 'vectors', standbyUntil: 0 },
});
aiCore.aircraft.push(sbAc);
aiCore.time = 1000;
const rSb = Commands.parse('AZU9100 STAND BY DUE TRAFFIC', aiCore);
console.log('SBcmd  ->', rSb.err || rSb.atcText, '| rb:', JSON.stringify(rSb.results.map(r => r.rb || r.err)));
const sbOk = !rSb.err && sbAc.pilotAi.standbyUntil > aiCore.time && /tráfego|trafego/i.test((rSb.results[0] && rSb.results[0].rb) || '');
aiCore.maybePilotInitiative(sbAc);
const sbSilent = aiCore.pendingRadio.filter(m => m.ac === sbAc).length === 0;
const rExp = Commands.parse('AZU9100 EXPECT APPROACH', aiCore);
const expOk = !rExp.err && /aproximação em breve/i.test(rExp.atcText || '');
console.log(sbOk && sbSilent && expOk ? 'OK STANDBY/PREVISAO (pt-en, IA silenciada)' : 'FALHA STANDBY ' + JSON.stringify({ sbOk, sbSilent, expOk, atc: rSb.atcText }));

// MAYDAY não repete após declaração
const mayAc = new Aircraft({
  cs: 'TAM9101', radio: 'LATAM', type: 'A320', kind: 'arr',
  x: 0, y: -20, alt: 7000, spd: 210, hdg: 0,
  nav: { mode: 'hdg', hdg: 0, turn: null },
  pilotAi: { nextAt: 0 },
});
aiCore.aircraft.push(mayAc);
aiCore.startEmergency(mayAc, 'engine-failure', { severity: 'high' });
mayAc.pilotAi.nextAt = 0;
aiCore.time += 40;
aiCore.pendingRadio = [];
aiCore.maybePilotInitiative(mayAc);
const mayTexts = aiCore.pendingRadio.map(m => m.text).join(' | ');
const noMaydayRepeat = !/MAYDAY MAYDAY MAYDAY/i.test(mayTexts) && !/repetindo/i.test(mayTexts);
console.log('MAYini ->', mayTexts || '(silêncio)');
console.log(noMaydayRepeat ? 'OK EMERG SEM MAYDAY REDUNDANTE' : 'FALHA MAYDAY REDUNDANTE');

// ---------- readback: input vs operacional ----------
const rbCore = new GameCore(airportJson, { cfg: '09', traffic: 'calmo', emit: () => {} });
rbCore.pendingRadio = [];
const rbArr = new Aircraft({
  cs: 'TAM9200', radio: 'LATAM', type: 'A320', kind: 'arr',
  x: -5, y: 10, alt: 6000, spd: 210, hdg: 90,
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
rbCore.aircraft.push(rbArr);
rbCore.runCommand('TAM9200 HOLD ABCXYZ');
const rbInput = rbCore.pendingRadio.map(m => m.text).join(' | ');
rbCore.pendingRadio = [];
rbCore.runCommand('TAM9200 DEC 09R');
const rbOps = rbCore.pendingRadio.map(m => m.text).join(' | ');
console.log('RBin   ->', rbInput);
console.log('RBops  ->', rbOps);
console.log(/Negativo\. Fixo ABCXYZ não encontrado/i.test(rbInput) && /já estamos em voo|impossível na fase/i.test(rbOps)
  ? 'OK READBACK INPUT/OPS'
  : 'FALHA READBACK ' + JSON.stringify({ rbInput, rbOps }));

// ---------- fraseologia radiotelefônica (callsigns) ----------
const rp1 = RadioPhrase.speakCallsign('GLO1234', { lang: 'pt' });
const rp2 = RadioPhrase.speakCallsign('AZU4512', { lang: 'en' });
const rp3 = RadioPhrase.speakCallsign('PT-ABC', { lang: 'en' });
const rp4 = RadioPhrase.speakCallsign('TAM3271', { radio: 'LATAM', lang: 'pt' });
console.log('RPcs   ->', rp1, '|', rp2, '|', rp3, '|', rp4);
console.log(
  rp1 === 'Gol Um Dois Três Quatro' &&
  rp2 === 'Azul Four Five One Two' &&
  rp3 === 'Papa Tango Alpha Bravo Charlie' &&
  rp4 === 'LATAM Três Dois Sete Um' &&
  !/Golf Lima Oscar/i.test(rp1)
    ? 'OK RADIO PHRASE CALLSIGN'
    : 'FALHA RADIO PHRASE ' + JSON.stringify({ rp1, rp2, rp3, rp4 })
);

// ---------- regras de separação (paralelas do aeroporto) ----------
const sepCore = new GameCore(airportJson, { cfg: '09', traffic: 'calmo', emit: () => {} });
const sepA = new Aircraft({
  cs: 'AZU9301', radio: 'Azul', type: 'A20N', kind: 'arr',
  x: -8, y: 0.35, alt: 2000, spd: 160, hdg: 90,
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
sepA.app = { phase: 'gs', rwy: '09L' }; sepA.landClr = true;
const sepB = new Aircraft({
  cs: 'GLO9302', radio: 'Gol', type: 'B738', kind: 'arr',
  x: -7.5, y: -0.35, alt: 2100, spd: 160, hdg: 90,
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
sepB.app = { phase: 'gs', rwy: '09R' }; sepB.landClr = true;
sepCore.aircraft = [sepA, sepB];
sepCore.checkConflicts(1);
const parallelOk = sepA.stca === 0 && sepB.stca === 0 && sepCore.stats.sepLoss === 0
  && Separation.isExempt(sepA, sepB);
// mesma pista / mesmo strip: deve conflitar
const sepC = new Aircraft({
  cs: 'TAM9303', radio: 'LATAM', type: 'A320', kind: 'arr',
  x: -7.2, y: 0.38, alt: 2050, spd: 160, hdg: 90,
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
sepC.app = { phase: 'gs', rwy: '09L' };
sepCore.aircraft = [sepA, sepC];
sepCore.stats.sepLoss = 0; sepCore.sepPairs.clear();
sepCore.checkConflicts(1);
const sameStripBad = sepA.stca === 2 && sepCore.stats.sepLoss >= 1;
console.log('SEPpar -> exempt?', parallelOk, '| same strip conflict?', sameStripBad);
console.log(parallelOk && sameStripBad ? 'OK SEPARATION RULES (paralelas isentas, mesma strip conflita)' : 'FALHA SEPARATION');

// ---------- decolagens simultâneas paralelas (SBCV N/S) — sem falso alarme ----------
const stdCore = new GameCore(airportJson, { cfg: '09', traffic: 'calmo', emit: () => {} });
stdCore.setRunwayUse('09L', 'ambas');
stdCore.setRunwayUse('09R', 'ambas');
const stdSid = Object.keys(DATA.SIDS).filter(id => DATA.SIDS[id].cfg === '09');
const stdA = new Aircraft({
  cs: 'AZU9401', radio: 'Azul', type: 'A20N', kind: 'dep', state: 'holdshort',
  x: -0.95, y: 0.58, alt: 0, spd: 0, hdg: 90, sid: stdSid[0],
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
stdA.rwy = '09L'; stdA.clrAlt = 5000;
const stdB = new Aircraft({
  cs: 'GLO9402', radio: 'Gol', type: 'B738', kind: 'dep', state: 'holdshort',
  x: -0.95, y: -0.58, alt: 0, spd: 0, hdg: 90, sid: stdSid[1] || stdSid[0],
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
stdB.rwy = '09R'; stdB.clrAlt = 5000;
stdCore.aircraft = [stdA, stdB];
stdA.cmdTakeoff('09L', stdCore);
stdB.cmdTakeoff('09R', stdCore);
let stdT = 0, stdAlarm = false, stdPast3500 = false;
while (stdT < 180) {
  stdCore.tick(0.5);
  stdT += 0.5;
  if (stdA.alt >= 3500 || stdB.alt >= 3500) stdPast3500 = true;
  if ((stdA.stca || 0) >= 2 || (stdB.stca || 0) >= 2 || stdCore.stats.sepLoss > 0) {
    stdAlarm = true;
    break;
  }
}
// mesma faixa: ainda deve conflitar acima de 400 ft
const stdSame = new Aircraft({
  cs: 'TAM9403', radio: 'LATAM', type: 'A320', kind: 'dep',
  x: 2.0, y: 0.42, alt: 1200, spd: 180, hdg: 90, rwy: '09L',
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
stdSame.rwy = '09L'; stdSame.state = 'air';
const stdNear = new Aircraft({
  cs: 'AZU9404', radio: 'Azul', type: 'A20N', kind: 'dep',
  x: 2.5, y: 0.38, alt: 1100, spd: 180, hdg: 90,
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
stdNear.rwy = '09L'; stdNear.state = 'air';
stdCore.aircraft = [stdSame, stdNear];
stdCore.stats.sepLoss = 0; stdCore.sepPairs.clear();
stdCore.checkConflicts(1);
const stdSameBad = stdSame.stca === 2 && stdCore.stats.sepLoss >= 1;
console.log('SEPdep -> past3500?', stdPast3500, '| noAlarm?', !stdAlarm, '| sameStrip?', stdSameBad,
  '| sepLoss', stdCore.stats.sepLoss);
console.log(stdPast3500 && !stdAlarm && stdSameBad
  ? 'OK SEPARATION DEPARTURES (paralelas sem alarme, mesma strip conflita)'
  : 'FALHA SEPARATION DEPARTURES ' + JSON.stringify({
    stdPast3500, stdAlarm, stdSameBad, sepLoss: stdCore.stats.sepLoss,
    altA: Math.round(stdA.alt), altB: Math.round(stdB.alt),
  }));

// ---------- hover (helicóptero) ----------
const hvCore = new GameCore(airportJson, { cfg: '09', traffic: 'calmo', emit: () => {} });
const hvH = new Aircraft({
  cs: 'PR-HVR', radio: 'Helicóptero', type: 'H125', kind: 'hel',
  x: 10, y: 8, alt: 1500, spd: 80, hdg: 270,
  nav: { mode: 'hdg', hdg: 270, turn: null },
});
hvH.heliAuto = false; hvH.heliState = 'crossing'; hvH.wptExit = [-20, 0];
hvCore.aircraft.push(hvH);
const rHv1 = Commands.parse('PR-HVR MAINTAIN HOVER', hvCore);
const pos0 = [hvH.x, hvH.y];
let thv = 0;
while (thv < 30) { hvH.update(0.5, hvCore); thv += 0.5; }
const stayed = Math.abs(hvH.x - pos0[0]) < 0.05 && Math.abs(hvH.y - pos0[1]) < 0.05 && hvH.spd < 3 && hvH.hovering;
const rHv2 = Commands.parse('PR-HVR HOLD POSITION', hvCore); // já pairando — ok de novo
const rHvAlias = !rHv2.err && hvH.hovering;
const rHv3 = Commands.parse('PR-HVR DCT FAROL', hvCore);
const leftHover = !hvH.hovering && !rHv3.err;
const rHvNat = Commands.parse('PR-HVR PERMANECA PAIRADO', hvCore);
const backHover = hvH.hovering && !rHvNat.err;
const rHvGo = Commands.parse('PR-HVR CONTINUE NAVIGATION', hvCore);
const resumed = !hvH.hovering && hvH.heliAuto && !rHvGo.err;
const fx = new Aircraft({
  cs: 'TAM9400', radio: 'LATAM', type: 'A320', kind: 'arr',
  x: -5, y: 5, alt: 5000, spd: 200, hdg: 90,
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
hvCore.aircraft.push(fx);
const rFx = Commands.parse('TAM9400 HOVER', hvCore);
const fxDenied = !!(rFx.results[0] && rFx.results[0].err);
console.log('HOVER  ->', rHv1.atcText, '| stayed?', stayed, '| dct clears?', leftHover, '| resume?', resumed, '| fixed-wing deny?', fxDenied);
console.log(stayed && rHvAlias && leftHover && backHover && resumed && fxDenied
  ? 'OK HOVER (estacionário, aliases, DCT/PROSSEGUIR limpam, asa fixa recusada)'
  : 'FALHA HOVER ' + JSON.stringify({ stayed, rHvAlias, leftHover, backHover, resumed, fxDenied, rb: rHv1.results }));

// ---------- holding pattern (racetrack) ----------
const hpCore = new GameCore(airportJson, { cfg: '09', traffic: 'calmo', emit: () => {} });
const hpAc = new Aircraft({
  cs: 'AZU9500', radio: 'Azul', type: 'A20N', kind: 'arr',
  x: U.fix('GOMES')[0] - 8, y: U.fix('GOMES')[1], alt: 6000, spd: 210, hdg: 90,
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
hpCore.aircraft.push(hpAc);
const rHp = Commands.parse('AZU9500 ENTER HOLDING OVER GOMES', hpCore);
const hpNavOk = !rHp.err && hpAc.nav.mode === 'hold' && hpAc.nav.phase === 'entry'
  && hpAc.nav.turn === 'R' && hpAc.nav.entry === 'direct' && typeof hpAc.nav.inboundHdg === 'number';
let thp = 0;
const phases = new Set();
while (thp < 900) {
  hpAc.update(0.5, hpCore);
  thp += 0.5;
  if (hpAc.nav.mode === 'hold') phases.add(hpAc.nav.phase);
}
const raced = phases.has('outbound') && phases.has('inbound') && (phases.has('outbound_turn') || phases.has('inbound_turn'));
const pathPts = Holding.pathPoints(hpAc.nav, hpAc.spd);
const pathOk = pathPts.length > 8;
const rHpL = Commands.parse('AZU9500 HOLD GOMES LEFT', hpCore);
const leftOk = !rHpL.err && hpAc.nav.turn === 'L';
const rHpNat = Commands.parse('AZU9500 AGUARDE SOBRE GOMES', hpCore);
const natOk = !rHpNat.err && hpAc.nav.mode === 'hold' && hpAc.nav.fix === 'GOMES';
hpAc.clrAlt = 6000;
Commands.parse('AZU9500 A 5000', hpCore);
const altKeepsHold = hpAc.nav.mode === 'hold' && hpAc.clrAlt === 5000;
Commands.parse('AZU9500 DCT NIDOL', hpCore);
const dctClears = hpAc.nav.mode !== 'hold';
console.log('HOLD  ->', rHp.atcText, '| phases:', [...phases].join(','), '| pathPts', pathPts.length);
console.log(hpNavOk && raced && pathOk && leftOk && natOk && altKeepsHold && dctClears
  ? 'OK HOLDING PATTERN (racetrack, L/R, aliases, alt mantém, DCT limpa)'
  : 'FALHA HOLDING ' + JSON.stringify({ hpNavOk, raced, pathOk, leftOk, natOk, altKeepsHold, dctClears, phases: [...phases] }));

// ---------- uso flexivel de pistas (pouso/dec/ambas por pista) ----------
const ruCore = new GameCore(airportJson, { cfg: '09', traffic: 'calmo', emit: () => {} });
const ru1 = ruCore.arrRwys().join(',') === '09L' && ruCore.depRwys().join(',') === '09R';
// troca direta L↔R sem passar por "ambas" (complementa a outra pista)
ruCore.setRunwayUse('09L', 'dec');
const ruSwap = ruCore.arrRwys().join(',') === '09R' && ruCore.depRwys().join(',') === '09L';
ruCore.setRunwayUse('09R', 'dec'); // inverte de novo: R=dec → L volta a pouso
const ruSwap2 = ruCore.arrRwys().join(',') === '09L' && ruCore.depRwys().join(',') === '09R';
ruCore.setRunwayUse('09R', 'ambas');
const ru2 = ruCore.arrRwys().join(',') === '09L,09R' && ruCore.depRwys().join(',') === '09R';
ruCore.setRunwayUse('09L', 'dec');
const ru3 = ruCore.arrRwys().join(',') === '09R' && ruCore.depRwys().join(',') === '09L,09R';
// invalida: pista única não aceita uso exclusivo (sem outra para complementar)
const _cfgRwys = ruCore.cfgRunways.bind(ruCore);
ruCore.cfgRunways = () => ['09R'];
ruCore.runwayUse = { '09R': 'ambas' };
const ruErr = ruCore.setRunwayUse('09R', 'dec') || {};
const ru4 = !!ruErr.err && ruCore.runwayUse['09R'] === 'ambas';
ruCore.cfgRunways = _cfgRwys;
ruCore.runwayUse = { '09L': 'ambas', '09R': 'ambas' };
const ru5 = ruCore.arrRwys().length === 2 && ruCore.depRwys().length === 2;
// spawn de saidas alterna entre as pistas de decolagem
const rwys = new Set();
for (let i = 0; i < 8; i++) { ruCore.spawnDeparture(); rwys.add(ruCore.aircraft[ruCore.aircraft.length - 1].rwy); }
const ru6 = rwys.has('09L') && rwys.has('09R');
// inversao de cabeceiras reseta ao padrao do novo fluxo
ruCore.setConfig('27');
const ru7 = ruCore.arrRwys().join(',') === '27R' && ruCore.depRwys().join(',') === '27L';
// serializa o uso para o snapshot do multiplayer
const ru8 = !!ruCore.serialize().runwayUse;
console.log([ru1,ruSwap,ruSwap2,ru2,ru3,ru4,ru5,ru6,ru7,ru8].every(Boolean)
  ? 'OK USO DE PISTAS (padrao, troca direta, ambas, so-dec, validacao, alternancia, inversao, snapshot)'
  : 'FALHA USO DE PISTAS ' + JSON.stringify({ru1,ruSwap,ruSwap2,ru2,ru3,ru4,ru5,ru6,ru7,ru8}));

// ---------- reatribuição de aproximação / pista (v1) ----------
const reArr = new Aircraft({
  cs: 'TAM8801', radio: 'LATAM', type: 'A320', kind: 'arr',
  x: -25, y: 30, alt: 10000, spd: 250, hdg: 120,
  star: 'SABIA1', nav: { mode: 'route', route: DATA.STARS.SABIA1.route.map(r => r.fix), idx: 1 },
});
game.aircraft.push(reArr);

// Cancelar STAR → hdg, star limpa, sem APP
const re1 = Commands.parse('TAM8801 CANCELAR STAR', game);
const re1ok = !re1.err && !re1.results[0].err && !reArr.star && reArr.nav.mode === 'hdg' && reArr.app.phase === 'none';

// Vetores naturais
reArr.star = 'PEDRA1'; reArr.via = true;
reArr.nav = { mode: 'route', route: ['NIDOL'], idx: 0 };
reArr.cmdIls('09L');
const re2 = Commands.parse('TAM8801 RADAR VECTORS', game);
const re2ok = !re2.err && !re2.results[0].err && !reArr.star && !reArr.via
  && reArr.app.phase === 'none' && reArr.nav.mode === 'hdg';

// Longe: visual rejeitado sem aeroporto à vista
reArr.x = -25; reArr.y = 30; reArr.airportInSight = false; reArr.sightRequested = false;
const reFar = Commands.parse('TAM8801 CLEARED VISUAL APPROACH RUNWAY 09L', game);
const reFarOk = !reFar.err && reFar.results[0].err && reFar.results[0].errKind === 'ops';

// REPORTE AEROPORTO perto (~14 NM) + VISUAL
reArr.x = -12; reArr.y = 8; reArr.airportInSight = false; reArr.sightRequested = false;
const reSight = Commands.parse('TAM8801 REPORTE AEROPORTO', game);
const reSightOk = !reSight.err && !reSight.results[0].err && reArr.airportInSight;
const re3 = Commands.parse('TAM8801 CLEARED VISUAL APPROACH RUNWAY 09L', game);
const re3ok = !re3.err && !re3.results[0].err && reArr.app.type === 'visual' && reArr.app.rwy === '09L';
const re4 = Commands.parse('TAM8801 ALTERAR PISTA PARA 27R', game);
const re4ok = !re4.err && !re4.results[0].err && reArr.app.rwy === '27R' && reArr.app.type === 'visual';
const re5 = Commands.parse('TAM8801 CANCELAR VISUAL', game);
const re5ok = !re5.err && !re5.results[0].err && reArr.app.phase === 'none';

// Visual → ILS (reclaim instrumental)
reArr.airportInSight = true;
const reVis = Commands.parse('TAM8801 VISUAL 09L', game);
const reIlsBack = Commands.parse('TAM8801 ILS 09L', game);
const reVisIlsOk = !reVis.err && !reVis.results[0].err && !reIlsBack.err && !reIlsBack.results[0].err
  && reArr.app.type === 'ils' && reArr.app.rwy === '09L' && reArr.app.phase === 'cleared';

// ILS mid-approach: troca de pista reinicia phase cleared
reArr.cmdIls('09L');
reArr.app.phase = 'loc';
const reSwitch = Commands.parse('TAM8801 ILS 27R', game);
const reSwitchOk = !reSwitch.err && !reSwitch.results[0].err
  && reArr.app.type === 'ils' && reArr.app.rwy === '27R' && reArr.app.phase === 'cleared';

// ILS e ALTPISTA (mesmo tipo)
const re6 = Commands.parse('TAM8801 ILS 09L', game);
const re6a = Commands.parse('TAM8801 ALTPISTA 27L', game);
const re6ok = !re6.err && !re6a.err && reArr.app.type === 'ils' && reArr.app.rwy === '27L' && !reArr.landClr;

// RNAV stub operacional
const re7 = Commands.parse('TAM8801 RNAV PISTA 09L', game);
const re7ok = !re7.err && re7.results[0].err && re7.results[0].errKind === 'ops';

// Cancel STAR nao derruba ILS já autorizado
reArr.star = 'SABIA1';
reArr.nav = { mode: 'route', route: DATA.STARS.SABIA1.route.map(r => r.fix), idx: 2 };
reArr.cmdIls('09L');
const re8 = Commands.parse('TAM8801 CANCEL STAR', game);
const re8ok = !re8.err && !reArr.star && reArr.app.phase === 'cleared' && reArr.app.type === 'ils';

console.log([re1ok, re2ok, reFarOk, reSightOk, re3ok, re4ok, re5ok, reVisIlsOk, reSwitchOk, re6ok, re7ok, re8ok].every(Boolean)
  ? 'OK REATRIBUICAO APP (cancel STAR, vetores, visual+sight, altpista, RNAV stub)'
  : 'FALHA REATRIBUICAO APP ' + JSON.stringify({ re1ok, re2ok, reFarOk, reSightOk, re3ok, re4ok, re5ok, reVisIlsOk, reSwitchOk, re6ok, re7ok, re8ok,
    re1, re2, reFar: reFar && reFar.results, reSight: reSight && reSight.results, re3: re3 && re3.results, re4: re4 && re4.results, re7: re7 && re7.results }));

// ---------- Resume own navigation ----------
const rnCore = new GameCore(airportJson, { cfg: '09', traffic: 'calmo', emit: () => {} });
const rnArr = new Aircraft({
  cs: 'AZU8700', radio: 'Azul', type: 'A20N', kind: 'arr',
  x: U.fix('PREMA')[0], y: U.fix('PREMA')[1], alt: 9000, spd: 250, hdg: 120,
  star: 'SABIA1',
  nav: { mode: 'route', route: DATA.STARS.SABIA1.route.map(r => r.fix), idx: 2 },
});
rnCore.aircraft.push(rnArr);
Approach.captureFlightPlan(rnArr);
const rnOnRoute = Approach.canResume(rnArr) === false;
Commands.parse('AZU8700 RADAR VECTORS', rnCore);
const rnVectored = rnArr.nav.mode === 'hdg' && !rnArr.star && rnArr.flightPlan && rnArr.flightPlan.name === 'SABIA1';
const rnCan = Approach.canResume(rnArr) === true;
const rn1 = Commands.parse('AZU8700 RESUME OWN NAVIGATION', rnCore);
const rn1ok = !rn1.err && !rn1.results[0].err && rnArr.star === 'SABIA1' && rnArr.nav.mode === 'route'
  && rnArr.nav.route[0] && DATA.STARS.SABIA1.route.some(r => r.fix === rnArr.nav.route[0]);
const rn2 = Commands.parse('AZU8700 RETOME A NAVEGACAO', rnCore);
const rn2ok = !rn2.err && !rn2.results[0].err && /já na navegação/i.test(rn2.results[0].rb || '');
Commands.parse('AZU8700 P 270', rnCore);
const rn3 = Commands.parse('AZU8700 PROSSIGA CONFORME A ROTA', rnCore);
const rn3ok = !rn3.err && !rn3.results[0].err && rnArr.nav.mode === 'route' && rnArr.star === 'SABIA1';
console.log('RESUME ->', rn1.atcText, '| can after vectors?', rnCan);
console.log(rnOnRoute && rnVectored && rnCan && rn1ok && rn2ok && rn3ok
  ? 'OK RESUME NAV (vetores preservam plano, reingresso, já-na-rota, pt)'
  : 'FALHA RESUME NAV ' + JSON.stringify({ rnOnRoute, rnVectored, rnCan, rn1ok, rn2ok, rn3ok, rb: rn1.results, star: rnArr.star, nav: rnArr.nav }));

// ---------- Emergency Traffic Manager ----------
const etmCore = new GameCore(airportJson, { cfg: '09', traffic: 'calmo', emit: () => {} });
const etmEmg = new Aircraft({
  cs: 'TAM9600', radio: 'LATAM', type: 'A320', kind: 'arr',
  x: -25, y: 0, alt: 5000, spd: 200, hdg: 90,
  nav: { mode: 'hdg', hdg: 90, turn: null },
});
etmCore.aircraft.push(etmEmg);
etmCore.startEmergency(etmEmg, 'engine-failure', { severity: 'high' });
etmEmg.emergency.info.runway = '09L';
etmEmg.emergency.stage = 'vectoring';
// Longe (> FAR): mesma faixa ainda pode decolar
const etmDepFar = new Aircraft({
  cs: 'GLO9601', radio: 'Gol', type: 'B738', kind: 'dep',
  state: 'holdshort', sid: 'CACTO1', dest: 'SBGR',
});
etmDepFar.rwy = '09L';
etmCore.aircraft.push(etmDepFar);
const etmFarOk = !etmCore.shouldHoldDeparture('09L', etmDepFar);
// Paralela sempre livre (independente)
const etmParOk = !etmCore.shouldHoldDeparture('09R', etmDepFar);
// Aproxima para dentro de CLOSE_NM → mesma faixa retém
etmEmg.x = -8; etmEmg.y = 0; etmEmg.app = { phase: 'cleared', rwy: '09L' };
etmEmg.emergency.stage = 'approach';
const etmCloseHold = etmCore.shouldHoldDeparture('09L', etmDepFar);
const etmClosePar = !etmCore.shouldHoldDeparture('09R', etmDepFar);
const etmWhy = etmCore.departureHoldReason('09L', etmDepFar);
const etmWhyOk = !!etmWhy && /temporariamente|aproximação|emergência/i.test(etmWhy);
console.log('ETM -> farSame?', etmFarOk, '| par?', etmParOk, '| closeHold?', etmCloseHold, '| closePar?', etmClosePar);
console.log(etmFarOk && etmParOk && etmCloseHold && etmClosePar && etmWhyOk
  ? 'OK EMERGENCY TRAFFIC (longe libera, paralela livre, final retém com motivo)'
  : 'FALHA EMERGENCY TRAFFIC ' + JSON.stringify({ etmFarOk, etmParOk, etmCloseHold, etmClosePar, etmWhy }));

// ---------- companhias históricas (AirlineService → DATA.AIRLINES) ----------
const histActiveOnly = __AIRLINES_ACTIVE__;
const histWithHist = __AIRLINES_HIST__;
const histHasActive = histActiveOnly.some(a => a.code === 'TAM') && histActiveOnly.some(a => a.code === 'GLO');
const histNoVarig = !histActiveOnly.some(a => a.code === 'VRG');
const histHasVarig = histWithHist.some(a => a.code === 'VRG' && a.radio === 'Varig');
const histHasVasp = histWithHist.some(a => a.code === 'VSP');
const histBigger = histWithHist.length > histActiveOnly.length;
DATA.AIRLINES = histWithHist;
const histSpeak = RadioPhrase.speakCallsign('VRG1234', { lang: 'pt' });
const histSpeakOk = histSpeak === 'Varig Um Dois Três Quatro';
DATA.AIRLINES = histActiveOnly;
const histMeta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/airlines.json'), 'utf8')).airlines;
const histMetaOk = histMeta.every(a =>
  a.name && a.icao && a.callsign && a.period && a.status &&
  (a.status === 'ativa' || a.ceased != null || a.status === 'incorporada')
);
console.log('HIST -> active', histActiveOnly.length, '| +hist', histWithHist.length, '| speak', histSpeak);
console.log(histHasActive && histNoVarig && histHasVarig && histHasVasp && histBigger && histSpeakOk && histMetaOk
  ? 'OK HISTORICAL AIRLINES (filtro ativa, pool histórico, fraseologia, metadados)'
  : 'FALHA HISTORICAL AIRLINES ' + JSON.stringify({
    histHasActive, histNoVarig, histHasVarig, histHasVasp, histBigger, histSpeakOk, histMetaOk, histSpeak,
  }));

