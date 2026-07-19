// ============================================================
// AircraftInfo — view-model do painel de informações da aeronave
// Consolida os dados operacionais de uma aeronave (real ou hidratada do
// snapshot) em grupos prontos para a UI, incluindo o ETA para o pouso.
// Módulo PURO: nada de DOM/rede. Browser usa o global AircraftInfo; Node
// importa via require (usado pelos testes de regressão).
// O painel NÃO deve ler campos da aeronave diretamente — só consome isto.
// ============================================================
'use strict';

// Compatibilidade dual: em Node, DATA/U vêm do módulo irmão; no browser são
// globais já carregados por data.js.
if (typeof DATA === 'undefined' && typeof require !== 'undefined') {
  const _d = require('./data.js');
  globalThis.DATA = _d.DATA;
  globalThis.U = _d.U;
}

const AircraftInfo = (() => {
  const DASH = '—';
  const ND = 'N/D';

  function fmtAltPair(ac) {
    const cur = U.fmtAlt(Math.round(ac.alt || 0));
    const clr = ac.clrAlt != null ? U.fmtAlt(Math.round(ac.clrAlt)) : null;
    return clr && Math.abs((ac.clrAlt || 0) - (ac.alt || 0)) > 60
      ? `${cur} (autz ${clr})`
      : cur;
  }

  // pista prevista: aproximação/decolagem em curso quando houver; senão a pista
  // padrão do fluxo ativo para o tipo de tráfego (via ctx, sem acoplar ao core)
  function expectedRunway(ac, ctx) {
    if (ac.app && ac.app.phase && ac.app.phase !== 'none' && ac.app.rwy) return ac.app.rwy;
    if (ac.rwy) return ac.rwy;
    if (ac.kind === 'arr') return (ctx && ctx.arrRwys && ctx.arrRwys[0]) || null;
    if (ac.kind === 'dep') return (ctx && ctx.depRwys && ctx.depRwys[0]) || null;
    return null;
  }

  // descrição do procedimento de aproximação ativo
  function approachLabel(ac) {
    if (!ac.app || !ac.app.phase || ac.app.phase === 'none') return null;
    const kind = ac.app.type === 'visual' ? 'Visual' : 'ILS';
    const phase = {
      cleared: 'autorizada',
      loc: 'no localizador',
      gs: 'na rampa',
    }[ac.app.phase] || '';
    const rwy = ac.app.rwy ? ' ' + ac.app.rwy : '';
    return `${kind}${rwy}${phase ? ' · ' + phase : ''}`;
  }

  // distância restante (NM) até a cabeceira prevista, ao longo da rota quando
  // possível. Retorna null quando indeterminada.
  function remainingDistance(ac, ctx) {
    if (!ac || ac.state !== 'air') return null;
    if (ac.kind !== 'arr') return null;
    const rwy = expectedRunway(ac, ctx);
    const thr = rwy && DATA.RUNWAYS[rwy] ? DATA.RUNWAYS[rwy].thr : [0, 0];
    // em aproximação: distância direta à cabeceira (o avião já aponta para lá)
    if (ac.app && ac.app.phase && ac.app.phase !== 'none') {
      return U.dist(ac.x, ac.y, thr[0], thr[1]);
    }
    // na rota (STAR): soma o trecho ao longo dos fixos à frente + do último
    // fixo até a cabeceira (aproximação final aproximada)
    if (ac.nav && ac.nav.mode === 'route' && Array.isArray(ac.nav.route) && ac.nav.route.length) {
      let d = 0, px = ac.x, py = ac.y;
      for (let i = ac.nav.idx; i < ac.nav.route.length; i++) {
        const f = U.fix(ac.nav.route[i]);
        if (!f) continue;
        d += U.dist(px, py, f[0], f[1]);
        px = f[0]; py = f[1];
      }
      d += U.dist(px, py, thr[0], thr[1]);
      return d;
    }
    // vetorado / proa: distância direta à cabeceira como aproximação grosseira
    return U.dist(ac.x, ac.y, thr[0], thr[1]);
  }

  // ETA para o pouso: só para chegadas no ar com velocidade utilizável.
  function eta(ac, ctx) {
    const d = remainingDistance(ac, ctx);
    const gs = ac ? (ac.spd || 0) : 0;
    if (d == null || !isFinite(d) || d <= 0 || gs < 40) return { seconds: null, text: ND };
    const seconds = (d / gs) * 3600; // NM / (NM/h) → h → s
    if (!isFinite(seconds) || seconds <= 0) return { seconds: null, text: ND };
    const mins = Math.round(seconds / 60);
    const text = mins < 1 ? '< 1 min' : mins + ' min';
    return { seconds, text };
  }

  // rótulo curto de estado do voo. Preferimos o rótulo já calculado pela UI
  // (ctx.stateLabel, ex.: stripStatus) para manter uma única fonte de verdade;
  // caso ausente, deriva um rótulo mínimo (útil em testes/headless).
  function stateLabel(ac, ctx) {
    if (ctx && ctx.stateLabel) return ctx.stateLabel;
    if (ac.onGround || (ac.state && ['taxi', 'holdshort', 'lineup', 'takeoff', 'abort', 'rollout'].includes(ac.state))) {
      return { taxi: 'Táxi', holdshort: 'Ponto de espera', lineup: 'Alinhado',
               takeoff: 'Decolando', abort: 'RTO', rollout: 'Pousou' }[ac.state] || 'No solo';
    }
    if (ac.app && ac.app.phase && ac.app.phase !== 'none') return 'Aproximação';
    if (ac.nav && ac.nav.mode === 'hold') return 'Espera';
    if (ac.nav && ac.nav.mode === 'hdg') return 'Vetor';
    return ac.kind === 'arr' ? 'Chegada' : ac.kind === 'dep' ? 'Saída' : 'VFR';
  }

  function kindLabel(ac) {
    if (ac.kind === 'arr') return 'Chegada';
    if (ac.kind === 'dep') return 'Saída';
    if (ac.kind === 'hel') return 'Helicóptero VFR';
    return DASH;
  }

  // monta o view-model completo, agrupado e pronto para a UI
  function build(ac, ctx) {
    ctx = ctx || {};
    const wtc = ac.perf && ac.perf.wtc ? ac.perf.wtc : (DATA.TYPES[ac.type] && DATA.TYPES[ac.type].wtc) || '?';
    const et = eta(ac, ctx);
    const expRwy = expectedRunway(ac, ctx);
    const app = approachLabel(ac);

    const id = {
      callsign: ac.cs,
      operator: ac.radio || DASH,
      type: ac.type || DASH,
      wtc,
    };
    const plan = {
      origin: ac.kind === 'arr' ? (ac.origin || ND) : DASH,
      dest: ac.kind === 'dep' ? (ac.dest || ND) : DASH,
      sid: ac.kind === 'dep' ? (ac.sid || DASH) : DASH,
      star: ac.kind === 'arr' ? (ac.star || DASH) : DASH,
      approach: app || DASH,
      expectedRwy: expRwy || DASH,
    };
    const ops = {
      alt: fmtAltPair(ac),
      spd: ac.onGround ? DASH : Math.round(ac.spd || 0) + ' kt',
      hdg: ac.onGround ? DASH : U.fmtHdg(ac.hdg || 0),
      stateLabel: stateLabel(ac, ctx),
      eta: et.text,
    };

    // grupos para a área expansível (só campos com conteúdo relevante)
    const idFields = [
      { label: 'Companhia', value: id.operator },
      { label: 'Tipo', value: `${id.type} / ${id.wtc}` },
    ];
    const planFields = [];
    if (ac.kind === 'arr') planFields.push({ label: 'Origem', value: plan.origin });
    if (ac.kind === 'dep') planFields.push({ label: 'Destino', value: plan.dest });
    if (ac.kind === 'arr' && ac.star) planFields.push({ label: 'STAR', value: plan.star });
    if (ac.kind === 'dep' && ac.sid) planFields.push({ label: 'SID', value: plan.sid });
    if (app) planFields.push({ label: 'Aproximação', value: plan.approach });
    if (expRwy) planFields.push({ label: ac.kind === 'dep' ? 'Pista decolagem' : 'Pista prevista', value: plan.expectedRwy });

    const opsFields = [
      { label: 'Estado', value: ops.stateLabel },
    ];
    if (ac.kind === 'arr' && !ac.onGround) opsFields.push({ label: 'ETA pouso', value: ops.eta });

    const groups = [
      { title: 'Identificação', fields: idFields },
      { title: 'Plano de voo', fields: planFields },
      { title: 'Operação', fields: opsFields },
    ].filter(g => g.fields.length);

    // essencial para o cartão compacto (celular)
    const compact = [];
    if (ac.kind === 'arr') {
      if (ac.star) compact.push({ label: 'STAR', value: plan.star });
      if (app) compact.push({ label: 'Aprox', value: plan.approach });
      compact.push({ label: 'Pista', value: plan.expectedRwy });
      if (!ac.onGround) compact.push({ label: 'ETA', value: ops.eta });
    } else if (ac.kind === 'dep') {
      compact.push({ label: 'Destino', value: plan.dest });
      if (ac.sid) compact.push({ label: 'SID', value: plan.sid });
      compact.push({ label: 'Pista', value: plan.expectedRwy });
    }

    return {
      id, plan, ops, groups, compact,
      eta: et,
      emergency: ac.emergency && ac.emergency.active ? true : null,
    };
  }

  return { build, eta, expectedRunway, approachLabel, remainingDistance, stateLabel };
})();

if (typeof module !== 'undefined') module.exports = { AircraftInfo };
