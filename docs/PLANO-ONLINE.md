# Plano: Login, Banco, Deploy e Multiplayer — ATC Brittz

> Documento de planejamento (2026-07). O jogo atual é 100% client-side e data-driven;
> este plano descreve a evolução para contas, nuvem e multiplayer cooperativo.

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
