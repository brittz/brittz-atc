# Plano: Login, Banco, Deploy e Multiplayer — ATC Brittz

> Documento de planejamento (2026-07), atualizado em 2026-07-15 com o STATUS DE HANDOFF
> (§8) para continuidade do desenvolvimento por outra IA/pessoa. Leia o §8 primeiro.

## 0. Ponto de partida (o que joga a nosso favor)

- O **motor já roda headless em Node** — os testes de regressão executam `aircraft.js`,
  `commands.js` e `data.js` fora do navegador. Ou seja: o servidor autoritativo do
  multiplayer reusa o motor existente sem reescrita.
- O espaço aéreo é **JSON por aeroporto** — cenários multiplayer (TMA-SP com SBGR+SBSP)
  são uma extensão natural do formato, não um novo sistema.

## 1. Arquitetura alvo

```
[Browser (jogo atual)] ──HTTPS──> [CDN: front estático]
        │ WebSocket
        ▼
[Game server Node.js]  ── driver ──> [MongoDB Atlas]
  · simulação autoritativa (motor atual)
  · sessões multiplayer + chat
  · auth (OAuth) + API de perfis/recordes
```

## 2. Login

**Fase 1 (recomendada): OAuth Google** — sem senha própria (não armazenamos credenciais,
não precisamos de e-mail transacional, risco de vazamento ≈ zero).

- Fluxo Authorization Code + PKCE no game server → cria/atualiza `users` → emite **JWT
  de sessão em cookie httpOnly `SameSite=Lax`** (não usar localStorage para token).
- Escolha de **nick único** no primeiro login (exibido no chat/sessões).
- **Convidado continua funcionando** como hoje (localStorage); ao logar, o recorde local
  é migrado para a conta.
- Fase 2 (opcional): e-mail+senha com **argon2id** e verificação por e-mail (Resend/SES).
- Higiene: rate-limit por IP nas rotas de auth, validação server-side de tudo, CORS
  restrito ao domínio do front.

## 3. Banco de dados — MongoDB (Atlas)

Free tier **M0 (512 MB)** atende por muito tempo. Collections:

| Collection | Documento (essência) | Índices |
|---|---|---|
| `users` | `{_id, googleId, nick, avatar, createdAt, prefs, stats:{recorde, pousos, saidas, horasATC}}` | `googleId` único, `nick` único |
| `sessions` | `{_id, code, hostId, scenario, positions:{TWR_SBGR:userId, TWR_SBSP, APP_SP, ACC_CW, GND_SBGR}, state: lobby/ativa/encerrada, createdAt, endedAt}` | `code` único, TTL p/ lobbies abandonados |
| `results` | `{sessionId, userId, position, score, pousos, conflitos, handoffs}` | `{userId, ts}` |
| `chats` | `{sessionId, fromId, toId(null=canal da sessão), text, ts}` | TTL 30 dias |
| `airports` | cartas versionadas (futuro, quando importarmos AISWEB) | `icao` |

## 4. Deploy — comparativo e recomendação

| Opção | Prós | Contras |
|---|---|---|
| **Vercel** | Front estático grátis, CDN, CI automático | **Serverless não mantém WebSocket** — o servidor de jogo precisa de processo vivo; exigiria Ably/Pusher/PartyKit (custo + complexidade) |
| **VPS própria** (Hetzner CX22 ~€4/mês, Oracle Free) | Controle total, WS nativo, um único deploy, barato | Administração (updates, segurança) por sua conta |
| **PaaS com processo persistente** (Fly.io/Railway/Render) | WS ok, zero administração, deploy por git push | Custo médio, menos controle |

**Recomendação em dois passos:**

1. **MVP**: front no **GitHub Pages ou Vercel** (grátis, o jogo já é estático) +
   **game server no Fly.io** (processo persistente, WS nativo, escala 0→1 fácil) +
   **MongoDB Atlas M0**. Custo ≈ R$ 0.
2. **Consolidação**: migrar o game server para **VPS Hetzner com docker-compose**
   (`caddy` para TLS automático + `game-server` Node) mantendo Atlas. Deploy via
   GitHub Actions → SSH. Custo ≈ R$ 30–40/mês com domínio.

Mongo local na VPS é possível, mas o Atlas dá backup/monitoração de graça — vale manter.

## 5. Multiplayer

### Modelo
**Servidor autoritativo**: a simulação roda no servidor (motor atual empacotado como
`/engine` compartilhado); os clients renderizam o radar e enviam comandos. Isso elimina
trapaça e divergência de estado, e a natureza do jogo (radar com varredura, ritmo lento)
tolera bem latência.

### Protocolo (WebSocket, JSON)
- cliente → servidor: `{t:'cmd', line:'TAM3412 A 6000'}` · `{t:'chat', to?, text}` ·
  `{t:'handoff', cs, accept}`
- servidor → clientes: snapshot delta a 1 Hz (posições/estados só da jurisdição +
  vizinhança) + eventos (rádio, score, strips). JSON no MVP; msgpack se precisar.

### Sessões e posições (cenário TMA-SP)
- Host cria a sessão → recebe **código de convite** (6 caracteres) → amigos entram no
  lobby e escolhem posição:
  - **TWR SBGR** — torre Guarulhos (pistas, pousos/decolagens GRU)
  - **TWR SBSP** — torre Congonhas
  - **APP SP** — Controle São Paulo (TMA: sequencia chegadas/saídas dos dois)
  - **ACC CW** — Centro Curitiba (enroute: entrega/recebe tráfego das TMAs)
  - **GND SBGR** — solo Guarulhos (fase posterior, ver §6)
- **Jurisdições** definidas por volumes no JSON do cenário (cilindro do aeródromo,
  setor da TMA, setor do Centro). O comando `HO` vira **handoff entre jogadores**:
  strip proposta aparece para a posição seguinte, que aceita (como na vida real).
- **Posição vaga = IA simples** (cumpre o último clearance / segue a carta), para a
  sessão funcionar com 2, 3 ou 4 amigos.
- Fim de turno → **debrief**: métricas por posição (pousos, conflitos, handoffs no ponto).

### Chat
- Canal da sessão + **privado** (`/w nick mensagem`), persistido em `chats` (opcional),
  rate-limit anti-flood, mute pelo host. Voz fica fora do MVP (texto + TTS local já dá
  imersão; voz real via WebRTC é upgrade futuro).

## 6. Controle de solo (avaliação)

**Viável e vale a pena — mas como fase própria, depois do MVP multiplayer.**

- **Dados**: camada `ground` no JSON do aeroporto: grafo de **taxiways** (nós/arestas
  nomeadas A, B, C…), **gates/spots**, **holding points** e entradas/saídas de pista.
  O OpenStreetMap tem as taxiways reais de SBGR/SBSP (`aeroway=taxiway`) — dá para
  escrever um conversor OSM → nosso JSON.
- **Física de solo**: taxi a 10–25 kt seguindo rota no grafo (Dijkstra), fila/precedência
  simples nos cruzamentos.
- **Comandos**: `PUSHBACK`, `TAXI VIA A B HOLD SHORT 09R`, `CRUZE 09L`, `GATE 214`.
- **Visual**: a camada ground renderiza **quando o zoom passa de um limiar** — o player
  de solo já abre ampliado, e os demais veem o pátio ao dar zoom (mesma engine de
  render, exatamente como você imaginou).
- **Esforço estimado**: comparável ao multiplayer MVP inteiro — por isso fase 4.

## 7. Roteiro

| Fase | Entrega | Depende de |
|---|---|---|
| F0 ✅ | Jogo single-player data-driven (atual) | — |
| F1 ✅ | Extrair `/engine` compartilhado + servidor Node rodando a MESMA partida single (autoridade no server) | — |
| F2 | Login Google + Atlas + recordes na nuvem | F1 |
| F3 ✅ (MVP: SBCV, posições TWR/APP/OBS, chat) | **Multiplayer MVP**: cenário TMA-SP (2 torres + APP + Centro), handoffs entre players, chat | F1, F2 |
| F4 | Controle de solo SBGR + corredores de helicóptero de SP | F3 |
| F5 | Cartas reais (AISWEB) em massa, mais cenários, ranking | F2 |

**Riscos principais**: escopo do solo (mitigado: fase própria); transcrição de cartas
reais é trabalhosa (mitigado: começar manual, automatizar com parser depois); custo de
infra cresce com voz em tempo real (mitigado: texto no MVP).

---

# 8. STATUS DE HANDOFF (2026-07-15)

## 8.1 O que está FEITO e verificado

- **F0/F1 ✅** — Motor extraído para `engine/` (data.js, aircraft.js, commands.js,
  core.js com a classe `GameCore` headless). Dual browser/Node (globais no browser +
  `module.exports` sob guard). `js/main.js` é um adaptador que preserva a facade
  `game` consumida por `js/radar.js` e `js/ui.js` — **esses dois não conhecem o core**.
- **F3 MVP ✅** — Multiplayer funcional NO AEROPORTO SBCV (não é ainda o cenário
  TMA-SP do §5): `server/` (HTTP estático + WebSocket `ws` em `/ws`, porta
  `PORT||8124`, sessões com código de 5 letras, posições TWR/APP/OBS com autoridade
  por domínio de comando, chat de sessão e privado com rate-limit, snapshots 1 Hz,
  tick 250 ms, Mongo opcional via `MONGODB_URI` com fallback em memória) +
  `js/net.js` (cliente WS, lobby, hidratação dos snapshots em instâncias reais de
  `Aircraft`, dead reckoning entre snapshots).
- **Integração E2E verificada**: 2 jogadores (browser + cliente ws), comando aplicado
  no servidor com readback, bloqueio por posição, chat nos dois sentidos.
- **Testes**: `node tests/run_test.js` → 13 cenários "OK" (motor completo: pouso via
  STAR/ILS, decolagens, condicionais APOS, RTO, helicópteros etc.). O servidor tem
  teste próprio que os agentes rodaram via clientes ws (não versionado; recriar se
  necessário seguindo docs/ARQUITETURA-MP.md §3/§4).
- **Jogo single-player completo** (F0) com: STARs/SIDs+cartas, ILS, condicionais
  `APOS` (fixo/NM/pés), subir/descer VIA, RTO, TAXI entre cabeceiras, HO manual,
  METAR dinâmico + troca de pistas, helicópteros VFR com cruzamento de ATZ, mobile
  (toque/pinça/roletas), localStorage (prefs + recorde).

## 8.2 PRÓXIMOS PASSOS (em ordem recomendada)

> **2026-07-19:** a execução dos itens abaixo está detalhada, com escopo e decisões,
> em **`docs/PLANO-MP-CONCLUSAO.md`** (leva P0–P3: higiene do MVP, seleção de
> aeroporto, handoff entre jogadores e deploy). Leia-o antes de codar nestes itens.

1. **Deploy do MVP** (§4): front + servidor juntos no Fly.io (o server já serve os
   estáticos — um único processo basta). Criar `Dockerfile` simples (node:22-slim,
   `CMD node server/index.js`) + `fly launch`. REQUISITO: conta Fly.io do usuário.
2. **F2 Login Google + Atlas** (§2/§3): implementar OAuth no server (rota
   `/auth/google` + callback; stub já existe em `server/store.js:authGoogle`),
   cookie httpOnly JWT, collection `users`, migração do recorde local no primeiro
   login. REQUISITOS: usuário criar OAuth Client ID no Google Cloud Console
   (origem = domínio do deploy) e cluster Atlas M0 (`MONGODB_URI`).
3. **Handoff entre jogadores**: hoje `HO` transfere para o Centro-IA. Evoluir para
   strip proposta → aceite da outra posição (protocolo `{t:'handoff'}` reservado no
   §5, ainda NÃO implementado no server/cliente).
4. **Cenário TMA-SP multi-aeroporto** (§5): novo JSON de cenário com 2+ aeroportos e
   volumes de jurisdição; exige generalizar `engine/core.js` (hoje 1 aeroporto por
   core) — provavelmente 1 core por cenário com N pistas/cartas e posição dona por
   volume.
5. **F4 Solo** (§6) e **F5 cartas reais** — como planejado.

## 8.3 Requisitos que dependem do USUÁRIO (não codificáveis)

- Conta Fly.io (ou VPS Hetzner) para deploy público.
- Google Cloud Console → OAuth 2.0 Client ID (para F2).
- MongoDB Atlas M0 → connection string em `MONGODB_URI` (para persistência real).
- Domínio próprio (opcional, para TLS/cookies em produção).

## 8.4 Restrições e convenções (NÃO violar)

- **JavaScript puro, sem build/bundler/framework**; scripts clássicos com globais no
  browser (`DATA, U, Aircraft, Commands, GameCore, Radar, UI, Net, game`).
  CommonJS (`require`) no Node. Comentários e UI em **pt-BR**, `'use strict'`.
- **docs/ARQUITETURA-MP.md é o contrato** entre engine/cliente/servidor — atualize-o
  ANTES de mudar protocolo ou interfaces.
- **O single-player não pode quebrar**: qualquer mudança no engine deve manter
  `node tests/run_test.js` 100% OK (adicione cenários novos ao tests/test_body.js).
- `js/radar.js` e `js/ui.js` não devem conhecer core/rede — falam só com a facade
  `game` (js/main.js decide entre core local e Net).
- Snapshot de rede = whitelist do §5 do contrato; nunca serializar o objeto inteiro.
- Aeroportos são dados (`airports/*.json` + manifesto); o motor não pode ganhar
  conhecimento hardcoded de aeroporto.
- Sem custos ocultos: voz = Web Speech local; nada de APIs pagas sem o usuário pedir.
- Commits em pt-BR, mensagem tipo `feat:`/`fix:`/`docs:`, com
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (ajuste ao seu modelo);
  push para https://github.com/brittz/brittz-atc (main).
- No Windows do usuário: PowerShell 5.1 (cuidado com aspas em `git commit -m`;
  prefira `git commit -F arquivo`); porta 8123 pode estar ocupada pelo Cursor.

## 8.5 Pendências conhecidas (pequenas)

- MP: `conflictPairs` não vai no snapshot → linhas de conflito não aparecem no radar
  dos clientes (adicionar ao serialize() e ao contrato §5).
- MP: score por evento chega como radio 'sys'; recorde local não é atualizado em MP
  (decisão pendente: recorde é conceito single-player ou por posição no MP?).
- MP: troca de pistas em uso (setConfig) bloqueada no cliente — decidir quem pode
  (host? APP?) e expor via protocolo.
- Cache agressivo do Chrome com `python -m http.server`/server Node sem headers de
  cache: usuários precisam de Ctrl+F5 após updates (considerar `Cache-Control:
  no-cache` nos estáticos do server — melhoria de 1 linha em server/index.js).
- Emergências (aeronave `emergency`) não têm tratamento especial no MP além do SP.
