# Feature: Approach and Runway Reassignment

## Objetivo
Permitir que o controlador altere dinamicamente a pista, o procedimento de aproximação ou o método de chegada de uma aeronave durante qualquer fase da aproximação, reproduzindo a flexibilidade existente nas operações reais de controle de tráfego aéreo.
O sistema deverá permitir mudanças de procedimento sem comprometer a navegação da aeronave, recalculando automaticamente a trajetória conforme necessário.

## Motivação
Na operação real, uma aeronave raramente está "presa" ao procedimento inicialmente autorizado. Mudanças por vento, pista bloqueada, congestionamento, emergência, separação, solicitação do piloto, meteorologia. O controlador deve poder alterar a estratégia de chegada a qualquer momento.

## Princípios
- Toda alteração deverá preservar navegação segura e contínua.
- Sempre que possível, reutilizar parte da rota já voada.
- Transição natural, sem mudanças bruscas.
- Compatível IFR e VFR.

## Situações suportadas
1. **Mudança de pista** — ex. ILS 27 → ILS 09; RNAV 15 → Visual 33
2. **Mudança de procedimento** (mesma pista) — ILS↔RNAV↔VOR↔Visual (implement what the engine already supports; if only ILS+visual exist today, architect for others)
3. **Cancelamento da STAR** — `Cancel STAR` → deixa de seguir carta, aguarda instruções / vetores
4. **Vetoração radar** — após cancelar STAR, HDG/P until new clearance
5. **Aproximação visual** — fluxo: reporte aeroporto à vista → autorizado visual pista X → navegação visual para alinhamento/pouso
6. **Retorno ao instrumental** — cancel visual, authorize ILS etc.
7. **Mudança por emergência/vento/sequenciamento** — same machinery (reassign runway/procedure)

## Replanejamento
Após alteração, recalcular navegação automaticamente: interceptação do procedimento, vetores, DCT, nova STAR, novo segmento de APP. Jogador não reconstrói tudo manualmente.

## IA do piloto
Confirma, abandona procedimento anterior, configura nova nav, reporta estabelecido quando aplicável.

## Comandos (parser pt/en → mesma representação interna)
PT: Cancelar STAR; Vetores radar; Aproximação visual pista 27; ILS pista 09; RNAV pista 15; Alterar pista para 33.
EN: Cancel STAR; Radar vectors; Cleared visual approach runway 27; Cleared ILS runway 09; Cleared RNAV runway 15; Change runway to 33.

## Interface
Atalhos contextuais em aproximação: Alterar pista, Alterar procedimento, Vetores radar, Aproximação visual, Cancelar STAR (desktop + mobile via quick buttons).

## Arquitetura
Prefer modules: Procedure Manager / Navigation Planner / Approach Manager — OR extend existing engine cleanly without over-engineering. Parser, UI, nav stay decoupled. Vanilla JS, no bundler.

**v1 (implementado):** módulo `engine/approach.js` (Procedure / Nav / Approach managers) + parser/`Commands` + atalhos em `js/ui.js`. Campo `app.type` (`ils`|`visual`|null) e flags `airportInSight` / `sightRequested` no snapshot. Fluxo aeroporto à vista: `REPORTE AEROPORTO` (ou auto se ≤ `SIGHT_NM`); obrigatório para `VISUAL` salvo se já perto. Diferidos: circling, RNP AR, pista por vento automático, cartas RNAV/VOR completas.

## Critérios de aceitação
- Alterar pista durante aproximação
- Alterar procedimento a qualquer momento
- Cancelar STAR → vetores
- Visual authorize/cancel
- Recalculo automático de nav
- Parser pt/en
- Atalhos contextuais
- Arquitetura extensível

---

## Escopo v1 vs futuro

### v1 (este release)

Inclui: `engine/approach.js`; fluxo airport-in-sight (`REPORTE AEROPORTO`; auto ≤ `SIGHT_NM`; exigido para VISUAL se longe). Diferidos: circling, RNP AR, auto wind runway, cartas RNAV/VOR completas.
| Capacidade | Comportamento |
|---|---|
| Cancelar STAR | `CANCELSTAR` — limpa `star`/`via`; se em `route`, passa a `hdg` na proa atual; **não** cancela ILS/visual já autorizado |
| Vetores radar | `VETORES` — cancela STAR + aproximação; mantém proa atual em modo `hdg` |
| ILS (já existia) | `ILS rwy` — `app.type='ils'`; troca de pista no meio da APP reinicia interceptação |
| Visual | `VISUAL rwy` — exige aeroporto à vista (`REPORTE AEROPORTO` ou ≤ ~22 NM); `app.type='visual'`; mesma geometria de eixo da pista; fraseologia distinta |
| Aeroporto à vista | `REPORTEAERO` / `REPORTE AEROPORTO` / `REPORT AIRPORT IN SIGHT` — confirma na hora se perto; senão `sightRequested` até entrar na distância |
| Cancelar visual | `CANCELVISUAL` — sai da APP visual → `hdg` atual |
| Alterar pista | `ALTPISTA rwy` — reautoriza o mesmo tipo de APP (ILS ou visual); se sem APP, autoriza ILS |
| RNAV / VOR | Parser aceita; resposta operacional clara se não houver procedimento no JSON do aeroporto (SBCV hoje: só ILS + visual) |
| Atalhos | Chegadas em voo: Cancelar STAR, Vetores, VISUAL/ILS por pista, Alterar pista, Cancelar visual |

### Futuro
- Cartas RNAV/VOR/LOC no JSON do aeroporto e interceptação por fixos publicados
- Circling, RNP AR, seleção automática de pista por vento
- Procedure Manager dedicado; SIDs/STARs com transição publicada pós-cancelamento
- Parallel/teardrop e holds publicados na APP
