# ATC Costa Verde — Changelog

> Histórico consolidado retroativamente a partir de todos os commits do repositório.
> As versões abaixo agrupam os commits por marco funcional, com a versão mais recente no topo.

## [0.6.0] — 2026-07-17

### Emergências e operação
- Sistema de Emergências 2.0 implementado com fluxo completo, estados, evolução, gravidade e impacto operacional no aeroporto
- Compatibilidade preservada entre single-player, multiplayer e interface mobile
- Painel de emergência refinado com fraseologia em pt-BR, perguntas rápidas contextuais e informações respondidas exibidas no painel da aeronave

### Reportes de posição
- Novo sistema de `REPORTE` por distância, fixo, altitude e nível de voo
- A aeronave memoriza a condição, segue o voo normalmente e faz a chamada automática quando a condição é satisfeita
- Helicópteros passaram a usar a mesma mecânica, evitando chamadas redundantes enquanto há reporte pendente

### Documentação
- Especificação de emergências 2.0 adicionada em `docs/SPECS/gameplay/emergency-system-v2.md`
- Especificação de reportes de posição adicionada em `docs/SPECS/gameplay/position-report-system.md`
- Contrato multiplayer/documentação técnica atualizado para refletir os novos estados e dados serializados

### Commits desta versão
- `3149a2f` — `feat: implementar sistema de reporte de posição`
- `98de44b` — `fix: ajustar painel e fraseologia das emergências`
- `c0b53bd` — `feat: implementar sistema de emergências 2.0`

---

## [0.5.0] — 2026-07-17

### Multiplayer
- Multiplayer MVP com servidor WebSocket, sessões, lobby e posições operacionais (`TWR`, `APP`, `OBS`)
- Motor de simulação compartilhado entre cliente e servidor, com autoridade do servidor e hidratação de snapshots no cliente
- Chat, pontuação, rádio e sincronização de estado operacional integrados ao modo online

### Estrutura e documentação
- README reorganizado para refletir a separação entre `engine/` e `server/`
- Plano online atualizado com handoff do estado do projeto
- Guias `AGENTS.md`/`CLAUDE.md` adicionados para orientar agentes e IAs trabalhando no repositório
- Regressão do motor versionada explicitamente em `tests/`

### Commits desta versão
- `0754bec` — `docs: guia AGENTS.md/CLAUDE.md para IAs (carregado automaticamente pelas ferramentas)`
- `565bcb1` — `docs: status de handoff no plano online + teste de regressao versionado em tests/`
- `3c39ff4` — `docs: estrutura do README atualizada para engine/ e server/`
- `e86c909` — `feat: multiplayer MVP — motor compartilhado, servidor WS e sessoes com posicoes`

---

## [0.4.0] — 2026-07-16

### Tráfego especial
- Introdução de helicópteros VFR com autorização de cruzamento da ATZ, chamada inicial, espera no limite da zona e continuação após autorização

### Planejamento do modo online
- Documentação inicial de login, MongoDB, deploy e multiplayer adicionada para sustentar a evolução do projeto

### Commits desta versão
- `53b52cd` — `feat: trafego de helicopteros VFR com autorizacao de cruzamento da ATZ`
- `90368ad` — `docs: plano de login, MongoDB, deploy e multiplayer`

---

## [0.3.0] — 2026-07-15

### Operação avançada
- Condicionais laterais antes da decolagem passaram a segurar a proa de pista corretamente
- `VIA` em saídas passou a autorizar subida pela SID e a combinar com decolagem e condicionais
- `DEC` simples passou a manter a proa de pista até nova instrução, em vez de engatar SID automaticamente
- Suporte a `RTO`, `V MIN/MAX`, `TAXI`, `APOS` por altitude e cumprimento parcial de instruções recusadas
- Restrições pré-decolagem (`A 2000`, `DCT`, etc.) passaram a ser respeitadas corretamente

### UI e pilotagem
- Card de informações separado das ações rápidas, com roletas de ajuste fino
- Roletas passaram a espelhar a autorização vigente da aeronave selecionada
- Linha de histórico passou a aparecer apenas na aeronave selecionada
- Botões de ação rápida e strips deixaram de engolir cliques

### Commits desta versão
- `5b9de9f` — `feat: DEC simples mantem proa de pista; SID so com 'subir via SID'`
- `072be80` — `fix: restricoes pre-decolagem respeitadas (A 2000, DCT e cumprimento parcial)`
- `3ba45bf` — `fix: linha de historico so aparece na aeronave selecionada`
- `7ea194f` — `feat: roletas espelham a autorizacao vigente da aeronave selecionada`
- `5b0fd8b` — `fix: botoes de acao rapida e strips nao engolem mais cliques`
- `f965ef6` — `feat: RTO, conflito penaliza por tempo, V MIN/MAX, TAXI, APOS por altitude, linha de historico e persistencia local`
- `75477dd` — `feat: subir via SID (VIA em saidas) combinavel com decolagem e condicionais`
- `8c30015` — `feat: card de informacoes separado das acoes + roletas de ajuste fino`
- `326b4fa` — `fix: condicional lateral antes da decolagem segura a proa de pista`

---

## [0.2.0] — 2026-07-15

### Base operacional expandida
- Aeroportos e fases passaram a ser dirigidos por JSON
- Suporte mobile/toque introduzido
- Condicionais `APOS`, `HO` e METAR dinâmico adicionados ao fluxo do jogo

### UX
- Leitura de proa/distância movida para o canto superior direito do radar
- Botão de tela cheia adicionado para desktop e Android/Chrome
- Ajuste para impedir a abertura automática do teclado do sistema em celular/tablet
- Botão direito do mouse passou a desselecionar a aeronave

### Commits desta versão
- `512d04f` — `feat: botao direito do mouse desseleciona a aeronave`
- `7b056f1` — `fix: teclado do sistema nao abre mais sozinho em celular/tablet`
- `e228983` — `feat: botao de tela cheia (desktop e Android/Chrome)`
- `b3e7acc` — `fix: leitura de proa/distância movida para o canto superior direito do radar`
- `877b7a9` — `feat: fases em JSON, mobile/toque, condicionais APOS, HO, METAR dinâmico`

---

## [0.1.0] — 2026-07-14

### Versão inicial
- Primeira versão jogável do simulador ATC Costa Verde
- Base do radar, strips, fluxo de chegadas e saídas, separação e interação por comandos

### Commits desta versão
- `5dcda2d` — `feat: ATC Costa Verde — versão inicial jogável do simulador ATC`
