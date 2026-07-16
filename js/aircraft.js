// ============================================================
// Aeronave: física, navegação e fases de voo
// ============================================================
'use strict';

// estados de solo/voo:
//  'taxi'      — strip visível, ainda taxiando (sem posição no radar)
//  'holdshort' — parada no ponto de espera
//  'lineup'    — alinhada na pista
//  'takeoff'   — rolagem de decolagem
//  'air'       — em voo
//  'rollout'   — corrida de pouso
//  'done'      — remover do jogo

class Aircraft {
  constructor(opts) {
    Object.assign(this, {
      cs: opts.cs, radio: opts.radio, type: opts.type,
      perf: DATA.TYPES[opts.type],
      kind: opts.kind,           // 'arr' | 'dep'
      x: opts.x ?? 0, y: opts.y ?? 0,
      alt: opts.alt ?? 0, spd: opts.spd ?? 0,
      hdg: opts.hdg ?? 90,
      clrAlt: opts.alt ?? 0,     // altitude autorizada
      clrSpd: opts.spd ?? 0,     // velocidade designada (0 = a critério)
      vs: 0,
      star: opts.star ?? null,   // nome da STAR
      sid: opts.sid ?? null,     // nome da SID
      dest: opts.dest ?? null,
      emergency: opts.emergency ?? false,
      state: opts.state ?? 'air',
      // navegação lateral
      nav: opts.nav ?? { mode: 'hdg', hdg: opts.hdg ?? 90, turn: null },
      via: false,                // "descer via STAR" autorizado
      app: { phase: 'none', rwy: null }, // none|cleared|loc|gs
      landClr: false,
      rwy: null,                 // pista em uso (decolagem/pouso)
      goingAround: false,
      sidEngaged: opts.kind === 'arr', // instrução lateral pós-decolagem definida
      depHdg: null,                    // proa designada antes da decolagem
      depDct: null,                    // direto designado antes da decolagem
      depViaSid: false,                // "subir via SID": segue a carta após decolar
      altAssigned: false,              // altitude explícita antes da decolagem
      holdRwyHdg: false,               // manter proa de pista até a condicional
      pending: [],                     // instruções condicionais (APOS fixo/NM/pés)
      spdMode: null,                   // null | 'min' | 'max' (a critério do comandante)
      trail: [], trailT: 0,
      path: [], pathT: 0,              // histórico completo da rota (linha opcional)
      stca: 0,                   // 0 ok, 1 previsto, 2 perda
      timer: opts.timer ?? 0,    // uso genérico (taxi, rollout...)
      handedOff: false,
      spawnT: opts.spawnT ?? 0,
      estabAnnounced: false,
      offRadarPenalized: false,
    });
    this.tas = this.spd;
  }

  get airborne() { return this.state === 'air'; }
  get onGround() { return ['taxi','holdshort','lineup','takeoff','rollout'].includes(this.state); }

  // ---- helpers ----
  fixDist(name) { const f = U.fix(name); return U.dist(this.x, this.y, f[0], f[1]); }
  fixBrg(name)  { const f = U.fix(name); return U.brg(this.x, this.y, f[0], f[1]); }

  routeFixes() {
    if (this.nav.mode !== 'route') return [];
    return this.nav.route.slice(this.nav.idx);
  }

  // restrições da STAR ainda à frente
  aheadRestrictions() {
    if (this.nav.mode !== 'route' || !this.star) return [];
    const star = DATA.STARS[this.star];
    if (!star) return [];
    const ahead = this.nav.route.slice(this.nav.idx);
    return star.route.filter(r => ahead.includes(r.fix));
  }

  // distância ao longo da rota até um fixo
  distAlongRoute(fixName) {
    if (this.nav.mode !== 'route') return this.fixDist(fixName);
    let d = 0, px = this.x, py = this.y;
    for (let i = this.nav.idx; i < this.nav.route.length; i++) {
      const f = U.fix(this.nav.route[i]);
      d += U.dist(px, py, f[0], f[1]);
      px = f[0]; py = f[1];
      if (this.nav.route[i] === fixName) return d;
    }
    return d;
  }

  // ---- comandos (retornam mensagem de readback ou {err}) ----
  cmdAlt(alt) {
    if (alt < 2000 || alt > 24000) return { err: 'altitude fora dos limites da TMA (2.000–FL240)' };
    // autorização de subida dada ainda no solo (aplicada após a decolagem)
    if (this.onGround) {
      if (this.kind !== 'dep' || this.state === 'rollout') return { err: 'ainda no solo' };
      this.clrAlt = alt;
      this.altAssigned = true; // restrição explícita: não aplicar o padrão de 5.000 ft
      return { rb: 'Após a decolagem, subindo para ' + U.fmtAlt(alt) };
    }
    const dir = alt < this.alt - 100 ? 'Descendo para ' : alt > this.alt + 100 ? 'Subindo para ' : 'Mantendo ';
    this.clrAlt = alt; this.via = false;
    return { rb: dir + U.fmtAlt(alt) };
  }
  cmdSpd(spd) {
    if (this.onGround) return { err: 'ainda no solo' };
    // mínima/máxima operacional: o valor fica a critério do comandante
    // (flape, peso, margem de estol) e varia com a fase do voo
    if (spd === 'MIN') { this.spdMode = 'min'; this.clrSpd = 0; return { rb: 'Reduzindo para a velocidade mínima operacional' }; }
    if (spd === 'MAX') { this.spdMode = 'max'; this.clrSpd = 0; return { rb: 'Acelerando para a velocidade máxima' }; }
    this.spdMode = null;
    if (spd !== 0 && spd < this.perf.min) return { err: `impossível, nossa mínima é ${this.perf.min} nós` };
    if (spd > this.perf.max) return { err: `impossível, nossa máxima é ${this.perf.max} nós` };
    this.clrSpd = spd;
    if (spd === 0) return { rb: 'Velocidade a nosso critério' };
    const dir = spd < this.spd - 5 ? 'Reduzindo ' : spd > this.spd + 5 ? 'Acelerando ' : 'Mantendo ';
    return { rb: dir + spd + ' nós' };
  }
  cmdHdg(hdg, turn) {
    // proa designada ainda no solo: substitui a SID após a decolagem (900 ft)
    if (!this.airborne) {
      if (this.kind !== 'dep' || this.state === 'rollout') return { err: 'ainda no solo' };
      this.depHdg = U.norm360(hdg);
      return { rb: 'Após a decolagem, proa ' + U.fmtHdg(hdg) };
    }
    this.cancelApproach();
    this.sidEngaged = true;
    if (this.kind === 'hel') this.heliAuto = false; // controlador assume a navegação
    this.nav = { mode: 'hdg', hdg: U.norm360(hdg), turn: turn || null };
    const t = turn === 'L' ? 'Curva à esquerda, proa ' : turn === 'R' ? 'Curva à direita, proa ' : 'Proa ';
    return { rb: t + U.fmtHdg(hdg) };
  }
  cmdDirect(fixName) {
    if (!U.fix(fixName)) return { err: 'fixo desconhecido' };
    // direto designado ainda no solo: substitui a SID após a decolagem (900 ft)
    if (!this.airborne) {
      if (this.kind !== 'dep' || this.state === 'rollout') return { err: 'ainda no solo' };
      this.depDct = fixName;
      return { rb: 'Após a decolagem, direto ' + fixName };
    }
    this.cancelApproach();
    this.sidEngaged = true;
    if (this.kind === 'hel') this.heliAuto = false;
    // se o fixo está na rota atual, pula para ele mantendo o resto
    if (this.nav.mode === 'route') {
      const i = this.nav.route.indexOf(fixName, this.nav.idx);
      if (i >= 0) { this.nav.idx = i; return { rb: 'Direto ' + fixName }; }
    }
    // senão: direto ao fixo e, se for da STAR/SID, retoma a carta a partir dele
    const proc = this.star ? DATA.STARS[this.star] : this.sid ? DATA.SIDS[this.sid] : null;
    let route = [fixName];
    if (proc) {
      const names = this.star ? proc.route.map(r => r.fix) : proc.route;
      const i = names.indexOf(fixName);
      if (i >= 0) route = names.slice(i);
    }
    this.nav = { mode: 'route', route, idx: 0 };
    return { rb: 'Direto ' + fixName };
  }
  cmdVia() {
    // saída: "subir via SID" — autoriza a subida até o teto publicado da carta.
    // Vale no solo (junto com a decolagem: DEC 09R VIA) ou em voo.
    if (this.kind === 'dep') {
      const sid = this.sid && DATA.SIDS[this.sid];
      if (!sid) return { err: 'não temos SID designada' };
      const top = sid.top || 15000;
      this.clrAlt = top;
      this.altAssigned = true;
      // em voo e vetorado: subir via SID inclui retomar a navegação da carta
      if (this.airborne && this.nav.mode !== 'route') {
        const join = this.nearestOf(sid.route);
        this.sidEngaged = true;
        this.nav = { mode: 'route', route: sid.route.slice(sid.route.indexOf(join)), idx: 0 };
        return { rb: 'Subir via SID ' + this.sid + ' para ' + U.fmtAlt(top) + ', direto ' + join };
      }
      // no solo: autoriza a navegação da carta após a decolagem
      this.depViaSid = true;
      return { rb: 'Subir via SID ' + this.sid + ' para ' + U.fmtAlt(top) };
    }
    // chegada: "descer via STAR" — cumpre as restrições da carta
    if (!this.star) return { err: 'não temos STAR designada' };
    if (this.nav.mode !== 'route') return { err: 'fora da STAR, solicite direto a um fixo da carta primeiro' };
    const rest = this.aheadRestrictions();
    if (!rest.length) return { err: 'já cumprimos todas as restrições da carta' };
    this.via = true;
    this.clrAlt = rest[rest.length - 1].alt;
    return { rb: 'Descer via STAR ' + this.star };
  }
  cmdIls(rwy) {
    if (!this.airborne) return { err: 'ainda no solo' };
    if (!DATA.RUNWAYS[rwy]) return { err: 'pista desconhecida' };
    this.app = { phase: 'cleared', rwy };
    this.estabAnnounced = false;
    return { rb: 'Autorizado ILS pista ' + rwy };
  }
  cmdLand(rwy) {
    if (this.app.phase === 'none' || (rwy && this.app.rwy !== rwy))
      return { err: 'não estamos na aproximação da pista ' + (rwy || '?') };
    this.landClr = true;
    return { rb: 'Autorizado pouso pista ' + this.app.rwy };
  }
  cmdLineup(rwy) {
    if (this.state !== 'holdshort') return { err: 'não estamos no ponto de espera' };
    if (DATA.RWY_PAIR[rwy] !== DATA.RWY_PAIR[this.rwy]) return { err: 'estamos no ponto de espera da ' + this.rwy };
    this.rwy = rwy;
    this.state = 'lineup';
    const r = DATA.RUNWAYS[rwy];
    this.x = r.thr[0]; this.y = r.thr[1]; this.hdg = r.hdg;
    return { rb: 'Alinhar e manter, pista ' + rwy };
  }
  cmdTakeoff(rwy) {
    if (!['holdshort','lineup'].includes(this.state)) return { err: 'não estamos prontos na pista' };
    if (rwy && DATA.RWY_PAIR[rwy] === DATA.RWY_PAIR[this.rwy]) this.rwy = rwy;
    else if (rwy) return { err: 'estamos no ponto de espera da ' + this.rwy };
    const wasLinedUp = this.state === 'lineup';
    const r = DATA.RUNWAYS[this.rwy];
    this.x = r.thr[0]; this.y = r.thr[1]; this.hdg = r.hdg;
    this.state = 'takeoff'; this.spd = 0;
    this.timer = wasLinedUp ? 0 : 6; // tempo para alinhar antes de rolar
    return { rb: 'Autorizado decolagem pista ' + this.rwy + ', rolando' };
  }
  // abortar a decolagem (RTO): desacelera na pista e taxia de volta à cabeceira
  cmdAbort() {
    if (this.state === 'lineup') {
      this.state = 'taxi';
      this.timer = U.rnd(40, 80);
      return { rb: 'Abandonando a pista, taxiando de volta à cabeceira' };
    }
    if (this.state !== 'takeoff') return { err: 'não estamos em rolagem de decolagem' };
    if (this.spd > this.perf.vr - 12) return { err: 'acima de V1, vamos prosseguir a decolagem' };
    this.state = 'abort';
    return { rb: 'Abortando a decolagem' };
  }

  // taxiar para outra cabeceira (ex.: após troca das pistas em uso)
  cmdTaxi(rwy) {
    if (!DATA.RUNWAYS[rwy]) return { err: 'pista desconhecida' };
    if (!['holdshort', 'lineup'].includes(this.state)) return { err: 'não estamos no pátio nem no ponto de espera' };
    if (DATA.RWY_PAIR[rwy] === DATA.RWY_PAIR[this.rwy] && this.state === 'holdshort' && rwy === this.rwy)
      return { err: 'já estamos no ponto de espera da ' + rwy };
    this.rwy = rwy;
    this.state = 'taxi';
    this.timer = U.rnd(50, 100);
    // re-arquiva a SID para a configuração da nova pista, mantendo o destino
    const cfgK = Object.keys(DATA.CONFIGS).find(k => DATA.CONFIGS[k].depRwy === rwy || DATA.CONFIGS[k].arrRwy === rwy);
    if (cfgK && this.sid && DATA.SIDS[this.sid]) {
      const exit = DATA.SIDS[this.sid].exit;
      const nova = Object.entries(DATA.SIDS).find(([, s]) => s.cfg === cfgK && s.exit === exit);
      if (nova && nova[0] !== this.sid) {
        this.sid = nova[0];
        return { rb: 'Taxiando para a cabeceira ' + rwy + ', nova saída ' + this.sid };
      }
    }
    return { rb: 'Taxiando para a cabeceira ' + rwy };
  }

  cmdHold(fixName) {
    if (!this.airborne) return { err: 'ainda no solo' };
    if (!U.fix(fixName)) return { err: 'fixo desconhecido' };
    this.cancelApproach();
    this.sidEngaged = true;
    this.nav = { mode: 'hold', fix: fixName, resume: this.nav.mode === 'route' ? { route: this.nav.route, idx: this.nav.idx } : null };
    return { rb: 'Espera sobre ' + fixName };
  }
  cmdGoAround() {
    if (!this.airborne || this.app.phase === 'none') return { err: 'não estamos em aproximação' };
    this.goAround('instrução do controle');
    return { rb: 'Arremetendo' };
  }
  cmdSid(name) {
    const sid = DATA.SIDS[name];
    if (!sid) return { err: 'SID desconhecida' };
    if (this.kind !== 'dep') return { err: 'somos uma chegada, não temos SID' };
    this.sid = name;
    if (this.onGround) return { rb: 'SID ' + name };
    // em voo: reingressa na SID pelo fixo mais próximo
    const join = this.nearestOf(sid.route);
    this.cancelApproach();
    this.sidEngaged = true;
    this.nav = { mode: 'route', route: sid.route.slice(sid.route.indexOf(join)), idx: 0 };
    return { rb: 'SID ' + name + ', direto ' + join };
  }
  cmdStar(name) {
    const star = DATA.STARS[name];
    if (!star) return { err: 'STAR desconhecida' };
    if (this.kind !== 'arr') return { err: 'somos uma saída, não temos STAR' };
    if (!this.airborne) return { err: 'ainda no solo' };
    const fixes = star.route.map(r => r.fix);
    const join = this.nearestOf(fixes);
    this.cancelApproach();
    this.star = name;
    this.via = false;
    this.nav = { mode: 'route', route: fixes.slice(fixes.indexOf(join)), idx: 0 };
    return { rb: 'Chegada ' + name + ', direto ' + join };
  }
  // autorização de cruzamento da zona do aeródromo (helicópteros VFR)
  cmdCross() {
    if (this.kind !== 'hel') return { err: 'não somos tráfego de cruzamento' };
    if (this.crossCleared) return { err: 'já autorizados a cruzar' };
    this.crossCleared = true;
    this.heliAuto = true;
    if (this.heliState === 'waiting') this.heliState = 'crossing';
    return { rb: 'Autorizado cruzamento da zona do aeródromo, prosseguindo' };
  }

  // transferência para o Centro (apenas saídas, perto do fim da SID e alto)
  cmdHandoff(game) {
    if (this.kind === 'arr') return { err: 'somos uma chegada — seguimos com você até o pouso' };
    if (!this.airborne) return { err: 'ainda no solo' };
    const exitFix = DATA.SIDS[this.sid] && DATA.SIDS[this.sid].exit;
    const d = U.dist(0, 0, this.x, this.y);
    const nearExit = (exitFix && this.fixDist(exitFix) < 12) || d > DATA.AIRPORT.range * 0.6;
    if (!nearExit) return { err: 'ainda não completamos a saída — cedo demais para o Centro', early: true };
    if (this.alt < 9000) return { err: 'ainda abaixo de 9.000 pés — cedo demais para o Centro', early: true };
    this.handedOff = true;
    if (game) game.completeHandoff(this, true);
    return { rb: 'Com o Centro, obrigado, até logo' };
  }
  // instrução condicional: executa após passar um fixo e/ou após N milhas
  addPending(cond) {
    if (this.pending.length >= 3) return { err: 'já temos três instruções condicionais pendentes' };
    const p = {
      fix: cond.fix || null,
      dist: cond.dist ?? null,
      alt: cond.alt ?? null,     // condição por altitude (pés)
      altDir: null,              // +1 cruzar subindo, -1 cruzar descendo
      tokens: cond.tokens,
      armed: !cond.fix,          // com fixo: arma ao cruzá-lo
      origin: null,              // ponto de referência para medir a distância
    };
    if (!p.fix && p.alt === null) {
      // sem fixo: mede da posição atual (ou da corrida de decolagem, se no solo)
      if (this.airborne) p.origin = [this.x, this.y];
      // no solo: origem definida quando a rolagem começar (checkPending)
    }
    // condicional LATERAL dado antes da decolagem: mantém a proa de pista até
    // disparar (a instrução do controle substitui a navegação da SID)
    let extra = '';
    const LATERAL = ['P', 'PROA', 'H', 'HDG', 'PE', 'PD', 'HL', 'HR', 'DIR', 'DCT', 'DIRETO'];
    if (this.kind === 'dep' && this.onGround && LATERAL.includes(p.tokens[0])) {
      this.holdRwyHdg = true;
      extra = ', mantendo a proa de pista até lá';
    }
    const whenParts = [];
    if (p.fix) whenParts.push(p.fix);
    if (p.dist) whenParts.push(p.dist + ' NM');
    if (p.alt !== null) whenParts.push(U.fmtAlt(p.alt));
    p.label = 'após ' + whenParts.join(' + ') + ' → ' + p.tokens.join(' ');
    this.pending.push(p);
    return { rb: 'Após ' + whenParts.join(', ') + ', ' + p.tokens.join(' ') + extra };
  }

  checkPending(game) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p.alt !== null) {
        // condição por altitude: dispara ao cruzar o nível (sentido definido
        // na primeira checagem — no solo, sempre subindo)
        if (p.altDir === null) p.altDir = this.alt < p.alt ? 1 : -1;
        if ((p.altDir > 0 && this.alt >= p.alt) || (p.altDir < 0 && this.alt <= p.alt)) {
          this.pending.splice(i, 1); game.execPending(this, p);
        }
        continue;
      }
      if (p.fix) {
        if (!p.armed) {
          if (this.fixDist(p.fix) < 1.4) { p.armed = true; p.origin = U.fix(p.fix).slice(); }
          continue;
        }
        const d = U.dist(this.x, this.y, p.origin[0], p.origin[1]);
        if (d >= (p.dist ?? 0.1)) { this.pending.splice(i, 1); game.execPending(this, p); }
      } else {
        if (!p.origin) {
          if ((this.state === 'takeoff' && this.spd > 30) || this.airborne) p.origin = [this.x, this.y];
          continue;
        }
        const d = U.dist(this.x, this.y, p.origin[0], p.origin[1]);
        if (d >= p.dist) { this.pending.splice(i, 1); game.execPending(this, p); }
      }
    }
  }

  // fixo da lista mais próximo da posição atual
  nearestOf(fixNames) {
    let best = fixNames[0], bd = Infinity;
    for (const f of fixNames) {
      const d = this.fixDist(f);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  cancelApproach() {
    if (this.app.phase !== 'none') {
      this.app = { phase: 'none', rwy: null };
      this.landClr = false;
    }
  }

  goAround(reason) {
    const r = DATA.RUNWAYS[this.app.rwy] || DATA.RUNWAYS[this.rwy] || null;
    this.app = { phase: 'none', rwy: null };
    this.landClr = false;
    this.goingAround = true;
    this.gaReason = reason;
    this.clrAlt = 4000;
    this.clrSpd = 0;
    this.nav = { mode: 'hdg', hdg: r ? r.hdg : this.hdg, turn: null };
  }

  // rampa do glideslope para a pista da aproximação
  gsAlt() {
    const r = DATA.RUNWAYS[this.app.rwy];
    const d = U.dist(this.x, this.y, r.thr[0], r.thr[1]);
    return Math.max(0, d * DATA.AIRPORT.gsSlopeFtNm);
  }
  // desvio lateral do localizador (NM, assinado) e distância à cabeceira
  locDev() {
    const r = DATA.RUNWAYS[this.app.rwy];
    const crs = U.d2r(r.hdg);
    const dx = this.x - r.thr[0], dy = this.y - r.thr[1];
    // componente ao longo do curso (negativa = antes da cabeceira) e perpendicular
    const along = dx * Math.sin(crs) + dy * Math.cos(crs);
    const cross = dx * Math.cos(crs) - dy * Math.sin(crs); // + = à direita do curso
    return { along, cross, dist: -along };
  }

  // ---------------- atualização ----------------
  update(dt, game) {
    if (this.state === 'taxi') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'holdshort';
        const r = DATA.RUNWAYS[this.rwy];
        // posição no ponto de espera, deslocada da pista
        const off = U.d2r(r.hdg + 90);
        this.x = r.thr[0] + Math.sin(off) * 0.18;
        this.y = r.thr[1] + Math.cos(off) * 0.18;
        this.hdg = r.hdg;
        game.radioPilot(this, `pronto para partida, ponto de espera pista ${this.rwy}`);
      }
      return;
    }
    if (this.state === 'holdshort' || this.state === 'lineup') return;

    if (this.state === 'takeoff') {
      this.checkPending(game);
      if (this.timer > 0) { this.timer -= dt; return; } // terminando de alinhar
      this.spd = Math.min(this.spd + this.perf.accel * 2.2 * dt, this.perf.vr + 15);
      this.moveStraight(dt);
      if (this.spd >= this.perf.vr) {
        this.state = 'air';
        this.alt = 50; this.vs = this.perf.climb;
        // subida inicial padrão de 5.000 ft SÓ quando o controle não impôs restrição
        if (!this.altAssigned) this.clrAlt = Math.max(this.clrAlt, 5000);
        this.clrSpd = 0;
        this.nav = { mode: 'hdg', hdg: DATA.RUNWAYS[this.rwy].hdg, turn: null };
      }
      return;
    }

    if (this.state === 'abort') {
      // frenagem máxima na pista, depois taxia de volta ao ponto de espera
      this.spd = Math.max(0, this.spd - 4.5 * dt * 9);
      this.moveStraight(dt);
      if (this.spd <= 20) {
        this.state = 'taxi';
        this.timer = U.rnd(60, 110);
        // zera a referência das condicionais por distância (nova corrida)
        for (const p of this.pending) if (!p.fix && p.alt === null) p.origin = null;
        game.radioPilot(this, 'decolagem abortada, livrando a pista e taxiando de volta à cabeceira', 1);
      }
      return;
    }

    if (this.state === 'rollout') {
      this.spd = Math.max(0, this.spd - 3.5 * dt * 9);
      this.moveStraight(dt);
      if (this.spd <= 25) {
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'done';
      }
      return;
    }

    // ------- em voo -------
    this.checkPending(game);
    if (this.kind === 'hel') this.updateHeli(dt, game);
    // saída aos 900 ft: aplica a instrução lateral dada antes da decolagem.
    // Sem instrução (DEC simples), MANTÉM A PROA DE PISTA aguardando o
    // controle — a SID só é seguida com "subir via SID" (VIA) ou vetores.
    if (this.kind === 'dep' && !this.sidEngaged && this.alt > 900) {
      this.sidEngaged = true;
      if (this.depHdg != null) {
        this.nav = { mode: 'hdg', hdg: this.depHdg, turn: null };
      } else if (this.depDct) {
        // direto dado antes da decolagem; se o fixo pertence à SID, retoma a carta
        const sid = this.sid && DATA.SIDS[this.sid];
        let route = [this.depDct];
        if (sid) {
          const i = sid.route.indexOf(this.depDct);
          if (i >= 0) route = sid.route.slice(i);
        }
        this.nav = { mode: 'route', route, idx: 0 };
      } else if (this.depViaSid && this.sid && DATA.SIDS[this.sid]) {
        this.nav = { mode: 'route', route: DATA.SIDS[this.sid].route.slice(), idx: 0 };
      }
      // senão: segue na proa de pista (nav já é a proa da decolagem)
    }
    this.updateLateral(dt, game);
    this.updateVertical(dt);
    this.updateSpeed(dt);
    this.moveStraight(dt);

    // trilha do radar
    this.trailT += dt;
    if (this.trailT >= 3) {
      this.trailT = 0;
      this.trail.push([this.x, this.y]);
      if (this.trail.length > 8) this.trail.shift();
    }
    // histórico completo (linha opcional nas configurações)
    this.pathT += dt;
    if (this.pathT >= 5) {
      this.pathT = 0;
      this.path.push([this.x, this.y]);
      if (this.path.length > 240) this.path.shift();
    }
  }

  // ---- helicóptero VFR cruzando a zona do aeródromo (raio 5 NM) ----
  // reporta na aproximação e, sem autorização, paira no limite da zona
  updateHeli(dt, game) {
    if (!this.heliAuto) return; // o controlador assumiu com vetores
    const ZONE = 5;
    const d = U.dist(0, 0, this.x, this.y);
    const toExit = () => {
      this.nav = { mode: 'hdg', hdg: U.brg(this.x, this.y, this.wptExit[0], this.wptExit[1]), turn: null };
    };
    if (this.heliState === 'inbound') {
      toExit();
      if (!this.crossRequested && d < 9) {
        this.crossRequested = true;
        game.radioPilot(this, `helicóptero a ${Math.round(d)} milhas do aeródromo, ` +
          `${U.fmtAlt(Math.round(this.alt))}, solicitamos cruzamento da zona`);
      }
      if (d <= ZONE + 0.2) {
        if (this.crossCleared) this.heliState = 'crossing';
        else {
          this.heliState = 'waiting';
          game.radioPilot(this, 'mantendo posição fora da zona, aguardando autorização de cruzamento');
        }
      }
    } else if (this.heliState === 'waiting') {
      if (this.crossCleared) this.heliState = 'crossing';
      // pairando: a velocidade-alvo vira zero em updateSpeed
    } else if (this.heliState === 'crossing') {
      toExit();
      if (d < ZONE) this.zoneEntered = true;
      if (this.zoneEntered && d > ZONE + 0.5) {
        this.heliState = 'clear';
        game.onHeliCrossed(this);
      }
    } else if (this.heliState === 'clear') {
      toExit();
      if (U.dist(this.x, this.y, this.wptExit[0], this.wptExit[1]) < 2 || d > 26) this.state = 'done';
    }
  }

  moveStraight(dt) {
    const v = this.spd / 3600; // NM/s (GS ≈ IAS, simplificação)
    this.x += Math.sin(U.d2r(this.hdg)) * v * dt;
    this.y += Math.cos(U.d2r(this.hdg)) * v * dt;
  }

  turnToward(target, dt, forced) {
    const rate = (this.spd > 260 ? 2.2 : 3) * dt;
    let diff = U.adiff(this.hdg, target);
    if (forced === 'L' && diff > 0) diff -= 360;
    if (forced === 'R' && diff < 0) diff += 360;
    if (Math.abs(diff) <= rate) { this.hdg = U.norm360(target); if (this.nav.turn) this.nav.turn = null; }
    else this.hdg = U.norm360(this.hdg + Math.sign(diff) * rate);
  }

  updateLateral(dt, game) {
    // aproximação ILS domina a navegação
    if (this.app.phase !== 'none') {
      const r = DATA.RUNWAYS[this.app.rwy];
      const { cross, dist } = this.locDev();
      if (this.app.phase === 'cleared') {
        const closing = Math.abs(U.adiff(this.hdg, r.hdg)) < 100;
        if (dist > 0 && dist < 25 && closing && Math.abs(cross) < Math.max(0.25, this.spd / 3600 * 12)) {
          this.app.phase = 'loc';
        }
      }
      if (this.app.phase !== 'cleared') {
        // rastrear localizador: correção proporcional ao desvio
        const corr = Math.max(-30, Math.min(30, -cross * 40));
        this.turnToward(r.hdg + corr, dt);
        if (!this.estabAnnounced && Math.abs(cross) < 0.2) {
          this.estabAnnounced = true;
          game.radioPilot(this, `estabelecido no localizador ILS ${this.app.rwy}`);
        }
        // captura do glideslope
        if (this.app.phase === 'loc' && this.gsAlt() <= this.alt + 60 && dist < 18) this.app.phase = 'gs';
        // toque
        if (dist < 0.08 && this.alt < 120) {
          game.touchdown(this);
          return;
        }
        // checagens de arremetida na curta final
        if (this.app.phase === 'gs' && dist < 1.0 && dist > 0.08) {
          if (!this.landClr) { this.goAround('sem autorização de pouso'); game.onGoAround(this, 'sem autorização de pouso'); }
          else if (game.runwayOccupied(this.app.rwy, this)) { this.goAround('pista ocupada'); game.onGoAround(this, 'pista ocupada'); }
        }
        return;
      }
      // phase 'cleared': continua navegação normal abaixo até interceptar
    }

    if (this.nav.mode === 'hdg') {
      this.turnToward(this.nav.hdg, dt, this.nav.turn);
    } else if (this.nav.mode === 'route') {
      const fname = this.nav.route[this.nav.idx];
      if (!fname) { this.nav = { mode: 'hdg', hdg: this.hdg, turn: null }; return; }
      const f = U.fix(fname);
      const d = U.dist(this.x, this.y, f[0], f[1]);
      const antecip = Math.max(0.35, this.spd / 3600 * 12); // antecipação de curva
      if (d < antecip) {
        this.nav.idx++;
        if (this.nav.idx >= this.nav.route.length) {
          // fim da rota: mantém o rumo do último trecho
          this.nav = { mode: 'hdg', hdg: this.hdg, turn: null };
          if (this.kind === 'arr' && this.app.phase === 'none')
            game.radioPilot(this, `cruzando ${fname}, aguardando instruções`);
          return;
        }
      }
      this.turnToward(U.brg(this.x, this.y, f[0], f[1]), dt);
    } else if (this.nav.mode === 'hold') {
      const f = U.fix(this.nav.fix);
      const d = U.dist(this.x, this.y, f[0], f[1]);
      const R = 2.2;
      if (d > R + 1.5) this.turnToward(U.brg(this.x, this.y, f[0], f[1]), dt);
      else {
        // órbita à direita: proa tangente
        const brgFromFix = U.brg(f[0], f[1], this.x, this.y);
        this.turnToward(U.norm360(brgFromFix + (d < R ? 100 : 80)), dt, 'R');
      }
    }
  }

  updateVertical(dt) {
    let target = this.clrAlt;

    // "descer via": gerencia o perfil pelas restrições da carta
    if (this.via) {
      const rest = this.aheadRestrictions();
      if (rest.length) {
        const nxt = rest[0];
        const d = this.distAlongRoute(nxt.fix);
        const gs = Math.max(this.spd, 60) / 3600; // NM/s
        const t = d / gs;                          // s até o fixo
        const reqVs = (this.alt - nxt.alt) / (t / 60); // fpm necessários
        if (this.alt > nxt.alt + 50 && reqVs > this.perf.desc * 0.55) target = nxt.alt;
        else if (this.alt <= nxt.alt + 50) target = Math.min(this.alt, this.clrAlt);
        else target = this.alt; // ainda cedo para descer (perfil econômico)
        target = Math.max(target, this.clrAlt);
      }
    }

    // no glideslope: segue a rampa (nunca sobe para reencontrá-la)
    if (this.app.phase === 'gs') {
      const gsA = this.gsAlt();
      const maxDn = this.perf.desc * 1.3 / 60 * dt;
      if (gsA < this.alt) this.alt = Math.max(gsA, this.alt - maxDn);
      this.vs = -(this.spd / 60) * DATA.AIRPORT.gsSlopeFtNm; // razão típica na rampa
      return;
    }
    // com ILS autorizado e no localizador: pode descer até interceptar a rampa
    if (this.app.phase === 'loc') target = Math.min(target, Math.max(this.gsAlt(), 1800));

    const diff = target - this.alt;
    const maxRate = diff > 0 ? this.perf.climb : this.perf.desc;
    let rate = Math.min(Math.abs(diff) * 3, maxRate); // suaviza perto do nível
    this.vs = Math.sign(diff) * rate;
    if (Math.abs(diff) < 20) { this.alt = target; this.vs = 0; }
    else this.alt += this.vs / 60 * dt;

    if (this.goingAround && Math.abs(this.alt - this.clrAlt) < 300) this.goingAround = false;
  }

  updateSpeed(dt) {
    let target = this.clrSpd > 0 ? this.clrSpd : this.defaultSpd();
    if (this.spdMode === 'min') target = this.minSpdNow();
    if (this.spdMode === 'max') target = this.perf.max;
    // helicóptero sem autorização: reduz chegando perto da zona e paira no limite
    if (this.kind === 'hel' && this.heliAuto && !this.crossCleared) {
      if (this.heliState === 'waiting') target = 0;
      else if (this.heliState === 'inbound' && U.dist(0, 0, this.x, this.y) < 8) target = Math.min(target, 60);
    }
    // regra dos 250 kt abaixo de 10.000 ft
    if (this.alt < 10000) target = Math.min(target, 250);
    // restrições de velocidade da carta quando "via"
    if (this.via) {
      const rest = this.aheadRestrictions();
      if (rest.length && rest[0].spd) target = Math.min(target, rest[0].spd);
    }
    // perfil de aproximação automático
    if (this.app.phase === 'gs') {
      const { dist } = this.locDev();
      if (dist < 3) target = this.perf.app;
      else if (dist < 5.5) target = Math.min(target, 160);
      else if (dist < 9) target = Math.min(target, 180);
    }
    target = Math.max(target, this.minSpdNow());
    const acc = this.perf.accel * (target < this.spd ? 0.8 : 1);
    if (Math.abs(target - this.spd) < acc * dt) this.spd = target;
    else this.spd += Math.sign(target - this.spd) * acc * dt;
  }

  minSpdNow() {
    if (this.perf.heli) return this.heliState === 'waiting' ? 0 : 40;
    if (this.app.phase === 'gs') return this.perf.app;
    if (this.alt < 6000) return this.perf.min + 25;
    return this.perf.min + 45;
  }

  defaultSpd() {
    if (this.perf.heli) return Math.min(this.perf.max, 110);
    if (this.kind === 'dep') return Math.min(this.perf.max, 300);
    if (this.alt > 11000) return 280;
    if (this.alt > 7000) return 230;
    return 200;
  }
}
