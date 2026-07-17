# Guia para IAs/agentes trabalhando neste repositório

Jogo web de controle de tráfego aéreo (pt-BR) + multiplayer. Estado atual, próximos
passos, requisitos e pendências: **leia `docs/PLANO-ONLINE.md` §8 antes de tudo**.

## Regras de ouro

1. **JavaScript puro, sem build/bundler/framework.** Browser usa scripts clássicos com
   globais (`DATA, U, Aircraft, Commands, GameCore, Radar, UI, Net, game`); Node usa
   CommonJS. UI, comentários e commits em **pt-BR**; arquivos com `'use strict'`.
2. **`docs/ARQUITETURA-MP.md` é o contrato** engine ↔ cliente ↔ servidor (protocolo WS,
   GameCore, serialização, posições). Atualize o contrato ANTES de mudar interfaces.
3. **O single-player não pode quebrar.** Regressão do motor: `node tests/run_test.js`
   → todas as linhas "OK", nenhuma "FALHA". Adicione cenários em `tests/test_body.js`
   ao criar features de simulação.
4. **`js/radar.js` e `js/ui.js` não conhecem core nem rede** — só falam com a facade
   `game` (`js/main.js` decide entre GameCore local e `Net`).
5. **Aeroportos são dados** (`airports/*.json` + manifesto `airports/index.json`).
   O motor não pode ganhar conhecimento hardcoded de aeroporto/carta.
6. **Sem custos ocultos**: voz = Web Speech API local; nenhuma API paga sem o usuário
   pedir explicitamente.

## Mapa do código

| Caminho | Papel |
|---|---|
| `engine/` | Motor headless (data, aircraft, commands, core=GameCore) — browser E Node |
| `js/main.js` | Adaptador single-player (liga GameCore ao DOM; facade `game`) |
| `js/net.js` | Cliente multiplayer (WS, lobby, hidratação de snapshots) |
| `js/radar.js` / `js/ui.js` | Render do radar / strips, log, painéis (agnósticos) |
| `server/` | Servidor MP: HTTP estático + WS, sessões, posições, chat, Mongo opcional |
| `airports/*.json` | Espaço aéreo por aeroporto (fases) |
| `tests/run_test.js` | Regressão do motor (obrigatória antes de commit) |

## Como rodar

- Single-player: qualquer servidor estático (`python -m http.server 8129`).
- Multiplayer: `cd server && npm install && npm start` → http://localhost:8124
  (o servidor também serve os estáticos; simulação autoritativa no servidor).

## Ambiente do usuário (Windows)

- PowerShell 5.1: aspas quebram `git commit -m` com mensagens longas — use
  `git commit -F <arquivo>`. Porta 8123 costuma estar ocupada (Cursor).
- Chrome cacheia os .js agressivamente: teste com hard reload (Ctrl+F5).

## Git

- Remoto `origin` = https://github.com/brittz/brittz-atc, branch `main`, push direto.
- Mensagens `feat:`/`fix:`/`docs:` em pt-BR; inclua a linha de coautoria da IA que
  fez o trabalho (ex.: `Co-Authored-By: <modelo> <noreply@anthropic.com>`).
- Nunca commitar `server/node_modules` (já no .gitignore).
