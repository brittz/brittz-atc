# Feature: Airport Emergency Response

## Objetivo

Complementar o **Emergency System V2** (falhas/declaração da aeronave) com a resposta
operacional **do aeroporto**: acionamento de equipes, veículos de emergência como
entidades simuladas, bloqueio/inspeção de pista e transição Normal → Emergência →
Recuperação → Normal.

O controlador passa a **gerir a ocorrência no solo** (ARFF, ambulância, equipe médica,
operação completa), enquanto o piloto pode solicitar ou recusar assistência em solo.
A capacidade de livrar a pista é decidida pelo **estado da aeronave**, não pelo ATC.

---

## Motivação

Hoje o motor declara MAYDAY/PAN, faz a entrevista operacional e bloqueia decolagens
durante a emergência, mas a “resposta de aeroporto” é sobretudo texto (`Serviços de
emergência acionados`). Não há:

- veículos ativos no mapa;
- estados de pista independentes (bloqueada / em inspeção / liberada);
- comandos do controlador para acionar ou encerrar a resposta;
- pedidos espontâneos do piloto por assistência em solo.

Esta feature fecha o ciclo operacional da ocorrência sem reescrever o V2.

---

## Relação com Emergency System V2

| Camada | Responsável | Escopo |
|---|---|---|
| Falha / declaração / evolução / entrevista | `engine/emergency.js` | **não reescrever** |
| Estado operacional do aeroporto | `Emergency.operationalState` + resposta | estender |
| Bloqueio temporal legado (`emergencyRunwayBlock`) | `GameCore` | manter compatível; Runway State passa a ser a fonte canônica |
| Resposta no solo | **novo** `emergency_response.js` + unidades + pistas | esta feature |

---

## Arquitetura (modular, extensível)

### 1. `engine/runway_state.js` — Runway State Manager

Independente de MAYDAY. Estado **por pista** (id canônico; impacto por `RWY_PAIR`):

| Estado | Label UI | Significado |
|---|---|---|
| `free` | Livre | Disponível |
| `occupied` | Ocupada | Aeronave na pista (lineup/takeoff/rollout/abort) |
| `blocked` | Bloqueada | Interditada (aeronave imobilizada, fogo, trem, etc.) |
| `inspecting` | Em inspeção | Inspeção pós-ocorrência |
| `cleared` | Liberada | Inspeção ok; volta a `free` em seguida |

Motivos de bloqueio (extensíveis): `disabled-aircraft`, `gear-collapse`, `fire`,
`inspection`, `ops`, etc.

Integração: `GameCore.runwayOccupied` / `shouldHoldDeparture` consultam
`RunwayState.isUnavailable(rwy)` além da lógica V2 existente.

**Hooks futuros (não implementar no v1):** FOD, multi-pista com restrições cruzadas,
fechamento parcial de cabeceira.

### 2. `engine/emergency_units.js` — Emergency Units

Tipos v1: `arff` (bombeiros), `ambulance`, `medical`, `ops`.

Registro tipado (`UNIT_TYPES`) para acrescentar `follow-me`, `tow`, etc. sem
reestruturar.

Ciclo de vida por unidade:

```
at_base → enroute_staging → staging → entering → approaching → on_scene → returning → at_base
```

Movimento v1: lerp/heading em coordenadas NM (como aeronaves). Estrutura de
`navTarget` pronta para plugar taxiways depois.

### 3. `engine/emergency_response.js` — Emergency Response Manager

Coordena por ocorrência (callsign):

- abertura junto com `startEmergency`;
- pedidos do piloto (`assistance`: `fire` | `medical` | `inspection` | `none` | `full`);
- despacho do ATC (parcial ou operação completa);
- fases: `idle` → `standby` → `dispatched` → `staged` → `on_scene` → `recovering` → `complete`;
- mensagens de rádio/sistema (equipes a caminho, posicionadas, prontas; encerramento;
  pista liberada; operações retomadas);
- encerramento **somente** quando: aeronave segura, serviço concluído, pista não
  bloqueada, unidades retornando/retornadas.

**Hooks futuros:** evacuação completa, reboque, FOD, múltiplas emergências
simultâneas com priorização.

---

## Comandos (parser pt + en)

| Interno | Frases aceitas (exemplos) |
|---|---|
| `DISPATCH_FIRE` | `DISPATCH FIRE`, `ACIONE BOMBEIROS`, `ACIONE ARFF` |
| `DISPATCH_AMBULANCE` | `DISPATCH AMBULANCE`, `ACIONE AMBULANCIA` |
| `DISPATCH_MEDICAL` | `DISPATCH MEDICAL`, `ACIONE EQUIPE MEDICA` |
| `DISPATCH_FULL` | `DISPATCH FULL`, `ACIONE OPERACAO COMPLETA`, `ACTIVATE EMERGENCY RESPONSE` |
| `END_EMERGENCY` | `CANCEL EMERGENCY`, `CANCELAR EMERGENCIA`, `ENCERRAR EMERGENCIA` |

Domínio MP: **TWR** (solo/pista). Ajuda + `cmdHint` atualizados na mesma alteração.

---

## Pedidos do piloto

Em pontos do fluxo (declaração, aproximação, pós-pouso) o piloto pode:

- solicitar bombeiros / assistência médica;
- pedir só inspeção visual;
- recusar assistência (`none`).

O pedido pode mudar se a emergência evoluir (ex.: fumaça → fogo). O ATC ainda pode
acionar recursos a qualquer momento durante a ocorrência.

---

## Aeronave imobilizada na pista

`Emergency.cannotVacate(emg)` (kinds/severidade: fogo, trem, hidráulica grave,
evacuação, etc.):

- após pouso permanece em `rollout` parado;
- `LIVRAR` é recusado com fraseologia operacional;
- `RunwayState` → `blocked`;
- unidades entram e aproximam;
- após serviço → inspeção → liberação; só então o encerramento é possível.

---

## UI / Radar

- Atalhos (desktop + mobile, `quickBtns`) com emergência ativa:
  Acionar Bombeiros, Ambulância, Equipe Médica, Operação Completa, Encerrar Emergência.
- Radar: marcadores simples para unidades presentes (cores alinhadas ao tema).
- Facade `game`: expor `emergencyUnits` / espelho de pistas se necessário; **radar/ui
  não importam core/net**.

---

## Multiplayer / snapshot

Atualizar `docs/ARQUITETURA-MP.md` **antes** de alterar interfaces:

- snapshot ganha `emergencyUnits: [...]` e `runwayStates: {...}` (ou equivalente leve);
- hidratação em `js/net.js`;
- `TWR_CMDS` inclui os tokens de despacho/encerramento.

---

## Critérios de aceite (v1)

1. Controlador despacha equipes a qualquer momento na ocorrência.
2. Aeronave solicita/recusa recursos de solo.
3. Veículos são entidades simuladas (posição/estado), não só texto.
4. Aeronave pode permanecer na pista quando o estado exigir; bloqueio é subsistema
   independente.
5. Estado da pista impacta tráfego (sem TO/pouso na faixa bloqueada).
6. Estado operacional do aeroporto acompanha a ocorrência.
7. Emergência só encerra após resposta completa (aeronave segura, serviço ok, pista
   ok, unidades retornando/retornadas).
8. Novos tipos de unidade entram pelo registro, sem reestruturação.

---

## Escopo v1 vs adiamentos

**Entregar:** fatia vertical despacho → staging → abordagem pós-pouso se imobilizada →
bloqueio/inspeção → recovery → clear.

**Adiar (só hooks):** evacuação detalhada, reboque, FOD, multi-emergência avançada,
taxi realista, follow-me.

---

## Escolhas de implementação (extensibilidade)

1. Três módulos novos com API estável (`create`/`update`/`serialize`/`hydrate`).
2. `UNIT_TYPES` e `BLOCK_REASONS` como mapas, não `switch` rígidos no core.
3. `EmergencyResponse` orquestra; `GameCore` só encaminha tick/comandos/eventos.
4. Compatibilidade: `finishEmergency` / `emergencyRunwayBlock` / testes V2 existentes
   continuam válidos; a resposta nova enriquece o mesmo fluxo.
5. Vanilla JS + CommonJS dual (browser globais / Node `require`), como o restante do
   motor.
