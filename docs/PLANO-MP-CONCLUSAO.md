# Plano de conclusão do Multiplayer (P0–P3) — ATC Costa Verde

> Derivado de `docs/PLANO-ONLINE.md` §8 (handoff) + verificação do código em 2026-07-19.
> **Escopo decidido com o usuário:** P0–P3 (MVP polido + handoff entre jogadores +
> seleção de aeroporto + deploy público). Login (F2), debrief por posição e TMA-SP
> ficam para levas seguintes — ver §5 deste arquivo.
>
> Regras permanentes (AGENTS.md): contrato `docs/ARQUITETURA-MP.md` é atualizado
> **antes** de mudar protocolo/interfaces; `node tests/run_test.js` 100% OK sempre;
> radar.js/ui.js só falam com a facade `game`; mudanças de comando atualizam o menu
> de ajuda em `index.html`; mudanças acumulam em bloco `-rc` no topo de `version.md`
> (abrir `## [0.9.5-rc]` na primeira mudança desta leva; não fechar sozinho).

## 1. Diagnóstico (verificado no código em 2026-07-19)

**Pronto (F3 MVP):** sessões com código de 5 letras, lobby TWR/APP/OBS, autoridade
por domínio de comando, chat + rate-limit, snapshots 1 Hz com hidratação real de
`Aircraft`, dead reckoning, Mongo opcional com fallback em memória. Regressão do
motor: 20 cenários OK.

| # | Lacuna | Evidência |
|---|---|---|
| 1 | Handoff entre jogadores não existe | `HO` vai direto ao Centro-IA (`engine/core.js:254 completeHandoff`); `{t:'handoff'}` só reservado no contrato |
| 2 | Aeroporto hardcoded no servidor | `server/sessions.js:143` carrega sempre `airports/sbcv.json` |
| 3 | `conflictPairs` não vai no snapshot | `js/main.js:85` retorna `[]` em MP — linhas de conflito invisíveis nos clientes |
| 4 | Troca de fluxo/pistas bloqueada em MP | `js/main.js:153,178`; evento `config` é broadcast pelo servidor mas `js/net.js` ignora `kind:'config'` |
| 5 | Sem debrief por posição | `runCommand` não sabe *quem* comandou; `results` grava só score total |
| 6 | Sem artefatos de deploy | sem `Dockerfile`/`fly.toml` |
| 7 | Login Google = stub | `server/store.js:authGoogle` |
| 8 | Sem teste E2E versionado do MP | PLANO-ONLINE §8.1 admite que o teste do servidor não foi versionado |

## 2. Decisões (tomadas com o usuário em 2026-07-19)

- **Escopo desta leva:** P0 → P3 (abaixo). P4+ fora.
- **Handoff:** **HO dirigido à posição** — `TAM3412 HO APP` propõe; o receptor aceita
  ou recusa explicitamente; timeout ~30 s = recusa implícita (aeronave permanece).
  Nada de proposta automática por ponto de transferência nesta leva.
- **Troca de pistas em uso (setConfig) em MP:** PENDENTE — recomendação registrada:
  autoridade da posição **APP** com a mesma regra de cobertura dos comandos (se APP
  vaga, qualquer não-OBS). Confirmar com o usuário ao iniciar a P0.
- **Recorde:** é conceito single-player; sessão MP não grava recorde local
  (documentar no contrato/README; score da sessão vive no `results` do store).

## 3. Fases

### P0 — Higiene do MVP (pequeno; zero dependências externas)

1. **`conflictPairs` no snapshot** — `engine/core.js serialize()` passa a incluir
   `conflictPairs` (forma leve: `[{a:csA, b:csB, loss}]`); contrato §5; espelho
   `Net.conflictPairs` (hidrata no `snap`); facade `game.conflictPairs` deixa de
   retornar `[]` em MP (`js/main.js:85`).
2. **Cache nos estáticos** — `server/index.js handleStatic`: header
   `Cache-Control: no-cache` (mata a necessidade de Ctrl+F5 após updates).
3. **Troca de fluxo em MP** — protocolo novo `{t:'setconfig', cfg}` (e, se
   decidido, `{t:'setrunwayuse', rwy, use}`): servidor valida autoridade (APP c/
   cobertura — ver decisão pendente), chama `core.setConfig`; o evento `config` já
   é broadcast por `_handleEmit` — falta `js/net.js` tratar `kind:'config'`
   (atualizar `Net.cfg` + rótulo + ATIS) e `js/ui.js`/`main.js` desbloquearem os
   botões para o jogador com autoridade (hoje `disabled` para todo mundo em MP).
4. **Recorde MP** — apenas documentar a decisão (contrato/README); nenhum código.
5. **`tests/run_mp_test.js` versionado** — sobe o servidor em processo filho (PORT
   de teste, ex.: 8194) e conecta 2 clientes WS em Node puro (sem dep nova: usar o
   `ws` já instalado em `server/node_modules` via `require('../server/node_modules/ws')`
   ou `require('ws')` com `node_modules` no path). Cenários mínimos:
   hello → create → join → position (conflito de posição) → start → cmd com
   autoridade (TWR dá comando de APP = erro; posição vaga = cobertura) → chat
   sessão/privado/rate-limit → setconfig (autoridade) → leave/destroy.

**Aceite P0:** `run_test.js` e `run_mp_test.js` 100% OK; contrato §3/§5 atualizado.

### P1 — Seleção de aeroporto na sessão (pequeno)

- `{t:'create', airport:'<id>'}` — id do manifesto `airports/index.json`;
  `server/sessions.js` resolve o arquivo pelo manifesto (**fim do hardcode de
  `sbcv.json`**), valida o id, inclui `airport` (id+título) no `sessionSnapshot`;
  lobby exibe o cenário escolhido; tela inicial: host escolhe o cenário ao criar
  (hoje só há SBCV — UI mínima, mas o caminho fica pronto para TMA-SP).
- Contrato §3 atualizado **antes** da implementação.

**Aceite P1:** sessões criadas com `airport` explícito e sem (default SBCV) ambas
funcionam; `run_mp_test.js` cobre os dois casos.

### P2 — Handoff entre jogadores, HO dirigido (médio — coração da leva)

**Modelo de controle (atualizar contrato §3/§4/§5 ANTES de codar):**

- A aeronave ganha `ctlPos`: posição que a controla agora. Spawn: `dep`→`TWR`,
  `arr`→`APP`, heli→`TWR`. Serializada no snapshot (whitelist §5).
- **Autoridade de comando (regra nova, §4):** se `ctlPos` está ocupada por outro
  jogador → erro "sob controle da posição X". Se vaga → cai na regra atual de
  domínio por token (cobertura). A regra por token continua valendo como domínio
  *máximo* da posição (TWR não dá comando de APP nem na própria aeronave).
- **`HO <POS>`** (`HO TWR` / `HO APP`): proposta de transferência. Servidor valida:
  remetente controla a aeronave; posição de destino existe e está ocupada por
  humano (se vaga → erro sugerindo `HO CTR`). Cria proposta pendente por callsign
  e envia ao receptor `{t:'handoff', cs, from, to, expiresAt}`.
- **Receptor:** `{t:'handoff', cs, accept:true|false}`. Aceite → `ctlPos` muda,
  log sys para a sessão, score pequeno (+25 "handoff no ponto") — score continua
  da sessão, não por jogador (debrief por posição é leva futura). Recusa/timeout
  30 s → proposta morre, aeronave permanece, log informa.
- **`HO` sem posição / `HO CTR`:** comportamento atual inalterado (Centro-IA,
  `completeHandoff`, state `done`) — preserva o SP e o fim de SID. Em MP exige
  controlar a aeronave.
- **Parser:** `HO` já vira token canônico; estender para capturar o token seguinte
  se for nome de posição (`HO TWR|APP|CTR`). Ajuda/`cmdHint` atualizados (regra 8).

**Cliente (`js/net.js` + `js/ui.js` via facade):** ao receber `handoff`, mostrar
elemento dedicado (canto do radar): callsign, de→para, contagem regressiva,
[Aceitar] [Recusar]; tratar expiração. Comandos de aceite/recusa saem por
`Net.send({t:'handoff', ...})`. Radar/strips continuam iguais (hidratação cobre
`ctlPos`; strip pode marcar visualmente aeronaves sob meu controle — opcional).

**Testes:** `run_mp_test.js` ganha cenários: proposta/aceite (ctlPos muda),
recusa, timeout, HO em posição vaga (erro), comando de terceiro bloqueado após
transferência, `HO CTR` preservado. Motor SP: `run_test.js` intacto (HO sem
posição não muda).

**Aceite P2:** 2 humanos trocam uma saída TWR→APP e uma chegada APP→TWR com
aceite; regressões verdes; contrato e ajuda atualizados.

### P3 — Deploy público (pequeno; depende da conta Fly.io do usuário)

- **`Dockerfile`** (raiz): `FROM node:22-slim`; copia `server/ engine/ js/ css/
  data/ airports/ index.html version.md`; `npm ci --omit=dev` em `server/`;
  `ENV PORT=8080`; `EXPOSE 8080`; `CMD ["node","server/index.js"]`.
- **`fly.toml`**: `internal_port = 8080`, `auto_stop_machines = 'stop'`,
  `min_machines_running = 0` (custo ~0 em repouso), health check HTTP em `/`.
- **`.dockerignore`**: `node_modules`, `.git`, `tests/`, `docs/`.
- **`docs/DEPLOY.md`**: `fly launch` (cria app), `fly deploy`,
  `fly secrets set MONGODB_URI=...` (opcional — sem ele o fallback em memória
  funciona), nota de que o WS é mesma origem (`wss://<app>.fly.dev/ws`) e o
  cliente já resolve isso sozinho (`js/net.js:62`).
- **Usuário executa:** criar conta Fly.io + rodar os comandos (não codificável).

**Aceite P3:** jogo acessível publicamente, 2 navegadores em máquinas distintas
jogando uma sessão completa.

## 4. Dependências do usuário nesta leva

- Conta Fly.io (P3) — única dependência externa de P0–P3.

## 5. Fora do escopo desta leva (levas futuras, ver PLANO-ONLINE.md)

- **P4 — Login Google + Atlas (F2):** `/auth/google` + callback, cookie JWT
  httpOnly, `users`, migração do recorde local. Depende de OAuth Client (Google
  Cloud) + `MONGODB_URI`. Stub: `server/store.js:authGoogle`.
- **P5 — Debrief por posição:** `runCommand(line,{byPos})` → métricas por posição;
  `{t:'end'}` (host) → `{t:'debrief',...}`.
- **P6 — Cenário TMA-SP multi-aeroporto:** JSON de cenário com 2+ aeroportos e
  volumes de jurisdição; GameCore multi-aeroporto; posições TWR_SBGR/TWR_SBSP/
  APP_SP/ACC_CW com autoridade por volume; handoffs entre volumes reutilizam o
  protocolo da P2. Maior refatoração — só depois de P2 validada.
- **F4 solo / F5 cartas reais:** como planejado no PLANO-ONLINE §6/§7.

## 6. Ordem de execução e critérios globais

Ordem: **P0 → P1 → P2 → P3**. Ao fim de cada fase:

- `node tests/run_test.js` → 100% OK (SP intacto);
- `node tests/run_mp_test.js` → 100% OK (existe a partir da P0);
- contrato `docs/ARQUITETURA-MP.md` atualizado **antes** de mudar protocolo;
- ajuda (`index.html`) atualizada quando comando muda (P2);
- `version.md`: acumular no bloco `-rc` do topo (abrir `## [0.9.5-rc]` na primeira
  mudança); commits `feat:`/`fix:`/`docs:` em pt-BR com coautoria da IA.
