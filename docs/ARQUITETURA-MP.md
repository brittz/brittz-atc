# Contrato de Arquitetura — Multiplayer MVP (F1+F3)

> Contrato entre os módulos. Agentes implementadores: sigam EXATAMENTE esta interface.
> Convenções: JavaScript puro (sem build/bundler), 'use strict', comentários em pt-BR,
> mesmo estilo dos arquivos existentes. O single-player DEVE continuar funcionando igual.

## 1. Estrutura de pastas alvo

```
engine/            motor compartilhado (browser + Node)
  data.js          (movido de js/data.js — DATA + U)
  emergency.js     NOVO: perfis/estados/evolução das emergências
  aircraft.js      (movido de js/aircraft.js)
  commands.js      (movido de js/commands.js)
  core.js          NOVO: classe GameCore (simulação headless, extraída de js/main.js)
js/                cliente browser
  main.js          adapta GameCore ao DOM/single-player (facade `game` preservada)
  net.js           NOVO: cliente WebSocket + modo multiplayer
  radar.js, ui.js  inalterados na medida do possível
server/
  index.js         NOVO: HTTP estático + WebSocket + sessões
  sessions.js      NOVO: gerência de sessões/posições/chat
  store.js         NOVO: persistência (MongoDB opcional via env, fallback memória)
  package.json     deps: ws (mongodb opcional)
```

Compatibilidade dual: cada arquivo de `engine/` termina com:
```js
if (typeof module !== 'undefined') module.exports = { ... };
```
No browser continuam expondo os globais atuais (`DATA`, `U`, `Aircraft`, `Commands`,
`GameCore`). O `index.html` passa a carregar `engine/*.js` no lugar de `js/data.js`,
`js/aircraft.js`, `js/commands.js`.

## 2. GameCore (engine/core.js)

Extraído do objeto `game` de js/main.js: TODA a simulação, ZERO DOM/UI.

```js
class GameCore {
  constructor(airportJson, { cfg, traffic, emit })
  // emit(ev) é chamado para todo efeito não-simulado; ev.type ∈:
  //  'radio' {who:'atc'|'pilot'|'sys', cs?, text, cls?}
  //  'score' {delta, why, total}
  //  'banner'{text, cls} · 'chime' {} · 'alarm' {on}
  //  'atis'  {letter, metar}
  //  'heli-crossed' etc. NÃO existem: usar radio/score

  tick(dt)                    // avança simulação (substeps internos como hoje)
  runCommand(line)            // parse+aplica; retorna {ok, err?}; emite radio
  setConfig(k)                // troca pistas em uso
  serialize()                 // snapshot completo p/ rede (ver §5)
  // campos públicos (leitura): aircraft[], score, stats, time, cfg, weather,
  //   conflictPairs, airportState, started, traffic
  // métodos públicos que o motor de aeronaves usa (mantidos): radioPilot,
  //   execPending, touchdown, onGoAround, runwayOccupied, windStr, clock,
  //   completeHandoff, onHeliCrossed, addScore, metar, atisLetter, tailwind,
  //   spawnArrival, spawnDeparture, spawnHeli
}
```

O que fica FORA do core (permanece em js/main.js): `selected`, `settings`, `simSpeed`,
`paused` (pausa/velocidade são do cliente SP; no MP o servidor manda o tempo), DOM,
localStorage, bootstrap, seleção de aeroporto. `js/main.js` mantém a facade `game`
com os MESMOS nomes usados por radar.js/ui.js (game.aircraft → core.aircraft etc.),
para que radar.js e ui.js não precisem mudar.

## 3. Protocolo WebSocket (JSON, 1 mensagem por frame)

Cliente → Servidor:
```
{t:'hello', nick}                       → responde hello-ok|error
{t:'create', cfg, traffic}              → cria sessão SBCV, vira host, responde session
{t:'join', code}                        → entra no lobby
{t:'position', pos}                     → 'TWR'|'APP'|'OBS' (livre se vaga)
{t:'start'}                             → só host; inicia
{t:'cmd', line}                         → comando ATC (valida posição, §4)
{t:'chat', text, to?}                   → to = nick (privado) ou ausente (sessão)
{t:'leave'}
```

Servidor → Cliente:
```
{t:'hello-ok', nick}
{t:'session', code, host, state:'lobby'|'ativa', players:[{nick,pos}], cfg, traffic}
{t:'start', airport:<JSON completo do aeroporto>, cfg, time}
{t:'snap', time, score, stats, weather:{dir,spd,qnh,temp}, atis, cfg, airportState, aircraft:[...]}
{t:'radio', who, cs?, text, cls?}
{t:'chat', from, to?, text}
{t:'event', kind:'banner'|'chime'|'alarm', ...payload}
{t:'error', msg}
```
Snapshots a 1 Hz por sessão; radio/chat/event imediatos. Sessão: código de 5 letras
maiúsculas. Sessão morre 60 s depois do último jogador sair.

## 4. Posições e autoridade de comando (MVP)

Primeiro token do comando (após callsign) define o domínio:
- **TWR**: ALINHAR/LU, DEC/TO/CTO/DECOLAR/TAKEOFF/TKFF/TKOF, AP/POUSO/CTL,
  ABORTAR/ABT/RTO/REJECT, TAXI/TAXIAR, CRZ/CRUZAR/CROSS/CRUZAMENTO, ARR/GA/ARREMETER
- **APP**: todo o resto (A, V, P, DIR, VIA, ILS, STAR, SID, ESPERA, HO, APOS…)
- **OBS**: nenhum comando; só chat.
Regra: se a posição dona do comando estiver ocupada por OUTRO jogador, quem não é o
dono recebe `{t:'error', msg:'instrução da posição TWR/APP'}`. Se a posição está vaga,
qualquer jogador (não-OBS) pode dar o comando (cobertura).

## 5. Serialização de aeronave (snapshot)

Whitelist (nada além disso): `cs, radio, type, kind, x, y, alt, spd, hdg, vs, clrAlt,
clrSpd, spdMode, state, nav, app, landClr, star, sid, dest, rwy, emergency, via, stca,
goingAround, timer, heliState, heliAuto, crossRequested, crossCleared, wptExit,
trail, pending:[{label}]`.

`airportState` do snapshot é um objeto leve `{state:'normal'|'emergency'|'recovery',
label, active:[callsigns], emergencyCs?, summary?}`. O campo `emergency` da aeronave
também é serializado como resumo leve (`active, kind, title, declaration, severity,
stage, evolution, answers, info, outcome, resultNote`) para o cliente reidratar com
o módulo `engine/emergency.js` sem depender do servidor para a UI.
No cliente MP, cada snapshot HIDRATA instâncias reais de `Aircraft`
(`Object.assign(new Aircraft({...}), dados)`) para radar.js/ui.js funcionarem sem
mudanças; entre snapshots o cliente roda `ac.update(dt, coreFake)` para interpolar
(dead reckoning com o próprio motor; o snapshot seguinte corrige).

## 6. Cliente multiplayer (js/net.js + lobby)

- Tela inicial ganha bloco "Multiplayer": nick + [Criar sessão] | [código + Entrar].
- Lobby: lista de jogadores/posições (botões TWR/APP/OBS), host tem [▶ Iniciar].
- Em jogo: `game` entra em modo remoto: `runCommand` → `{t:'cmd'}`; radio/score/atis
  vêm dos eventos; pausa/velocidade desabilitados; strips/radar/roletas idênticos.
- Chat pela caixa de comando: linha começando com `/c texto` (sessão) ou
  `/w nick texto` (privado). Mensagens de chat aparecem no log com classe própria.
- URL do servidor: mesma origem (o server serve os estáticos); `ws://host/ws`.

## 7. Persistência (server/store.js)

- `MONGODB_URI` definido → usa driver mongodb (users por nick, results, chats TTL 30d).
- Sem env → fallback em memória com a MESMA interface (o servidor nunca depende do
  Mongo para funcionar). Login Google fica para fase seguinte (scaffold: função
  `authGoogle()` stub documentado).

## 8. Como rodar

- SP (como hoje): `python -m http.server 8123` ou o próprio server abaixo.
- MP: `cd server && npm install && node index.js` → http://localhost:8124 (estáticos
  da raiz do projeto + `/ws`). Porta via `PORT`.
```
