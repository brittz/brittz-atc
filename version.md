# ATC Costa Verde — Changelog

> Histórico consolidado retroativamente a partir de todos os commits do repositório.
> As versões abaixo agrupam os commits por marco funcional, com a versão mais recente no topo.
>
> **Release candidate:** enquanto o cabeçalho for `X.Y.Z-rc`, as mudanças acumulam neste
> bloco. Só vira versão fechada (`X.Y.Z`) quando o usuário pedir para fechar/commitar.

## [0.9.5] — 2026-07-19

### Painel de informações da aeronave
- Painel de seleção (`selPanel`) evoluído para uma ferramenta de decisão: reúne origem,
  destino, tipo/esteira, SID/STAR, aproximação ativa, pista prevista, estado do voo e
  **ETA para o pouso** — atualizados automaticamente durante o voo
- Cartão compacto (chips essenciais sempre visíveis) + botão **Mais informações** para
  expandir os grupos (Identificação · Plano de voo · Operação); no celular abre recolhido e
  as informações extras da emergência entram na área expansível (cartão não incha)
- Serviço dedicado `engine/aircraft_info.js` (`AircraftInfo.build`/`.eta`) consolida o
  view-model — o painel não lê a aeronave diretamente; extensível para novos campos/ações
- **Clique no indicativo** em qualquer área (painel, strips, rótulos do radar, log de
  comunicações) insere-o na caixa de comando via ação reutilizável `UI.insertCallsign`:
  caixa vazia insere só o indicativo; mesmo indicativo preserva a edição em curso;
  indicativo diferente substitui. No celular não abre o teclado (proteção mobile mantida)
- **Clique no strip** (linha ou indicativo) seleciona a aeronave como no radar: abre
  `selPanel` + painel de ações rápidas e preenche a caixa (`game.select` / `activateCallsign`)
- Chegadas passam a ter **procedência** (`origin`), simétrica ao destino das saídas
  (`DATA.ORIGINS` por fixo de entrada da STAR; opcional no JSON do aeroporto)
- SPEC: `docs/SPECS/interface/aircraft-information-panel.md`

## [0.9.4] — 2026-07-18

### Voz — radiotelefonia (TTS)
- Camada `VoicePhrase.forTts`: números BR (Uno/Meia), pistas Esquerda/Direita/Centro, FL → Flight Level, frequências com Decimal, abreviações (ILS, DCT…)
- Callsigns alinhados à fraseologia BR (`Uno`/`Meia`); asa rotativa identifica-se como **Asa Rotativa** (não “Helicóptero”)
- SPEC: `docs/SPECS/gameplay/voice-radiotelephony.md`

## [0.9.3] — 2026-07-18

### Companhias históricas
- Opção **Companhias Históricas** nas configurações (desligada por padrão): inclui operadores brasileiros encerrados/incorporados na geração de tráfego
- Base em `data/airlines.json` via `AirlineService` (engine só consome `DATA.AIRLINES`); SPEC em `docs/SPECS/content/historical-airlines.md`
- Multiplayer: host envia `historicalAirlines` no `create` da sessão

### Changelog — versão na UI
- Parser de `version.md` aceita hífen (`-`) ou em-dash (`—`) entre versão e data; o cabeçalho `## [0.9.2] - …` deixava de casar e a UI ficava em `v?` / «Versão indisponível»

## [0.9.2] — 2026-07-18

### Uso das pistas — troca direta
- No ATIS, dá para inverter pouso/decolagem entre as pistas do fluxo sem precisar marcar «Ambas» antes: ao dedicar uma pista a um papel exclusivo, a outra se complementa automaticamente

## [0.9.1] — 2026-07-18

### Separação — decolagens paralelas
- Corrigido falso alarme/STCA ao autorizar duas decolagens simultâneas em faixas paralelas independentes (SBCV N/S): a isenção `simultaneousTakeoffs` deixa de cair ao passar de 3500 ft enquanto ambos ainda estão na bolha do aeródromo (~15 NM)

## [0.9.0] — 2026-07-18

### Quick panel — composição de roletas
- Ajustar ALT, PROA e/ou VEL acumula no mesmo comando (ex.: `TAM3412 A 6000 P 270 V 220`) em vez de sobrescrever só a última roleta
- Roletas tocadas ficam visualmente marcadas até a transmissão

### Changelog na UI
- Clique na versão do header (ou na linha de versão do menu) abre o modal com o conteúdo de `version.md`

### Emergência — rádio
- Removido o reporte inútil “emergência em andamento, sem mudanças significativas”; o piloto só atualiza quando a situação piora ou melhora

### Retomar navegação própria
- `RESUME` / `RETOME A NAVEGAÇÃO` / `RESUME OWN NAVIGATION` etc. reingressa na STAR/SID preservada após vetores/proa/DCT
- Plano guardado em `flightPlan`; botão contextual **Retomar navegação**; Navigation Planner em `approach.js`
- SPEC: `docs/SPECS/gameplay/resume-own-navigation.md`

### Gerenciamento de tráfego em emergência
- Emergência deixa de bloquear decolagens de forma indiscriminada; `engine/emergency_traffic.js` avalia faixa, fase, distância e Separation
- Pistas paralelas independentes (SBCV N/S) continuam; mesma faixa é retida em final/pós-pouso; longe do campo ainda pode liberar
- Motivo explícito na recusa de `DEC`; ATIS mostra restrições temporárias
- SPEC: `docs/SPECS/gameplay/emergency-traffic-management.md`

### Resposta de emergência do aeroporto
- Nova fatia vertical complementar ao Emergency System V2: despacho de equipes (ARFF,
  ambulância, médica, operação completa), veículos simulados no radar, bloqueio/inspeção
  de pista independente e encerramento só quando a ocorrência está segura
- Módulos `engine/runway_state.js`, `engine/emergency_units.js`, `engine/emergency_response.js`
- Comandos pt/en (`ACIONE BOMBEIROS`, `DISPATCH FIRE`, `ENCERRAR EMERGÊNCIA`, etc.), atalhos
  no painel, ajuda/`cmdHint`, domínio TWR no MP e campos de snapshot (`runwayStates`,
  `emergencyUnits`, `emergencyResponse`)
- SPEC: `docs/SPECS/gameplay/airport-emergency-response.md`

### Reatribuição de aproximação e pista
- Cancelar STAR (`CANCELSTAR` / pt-en) deixa a carta e aguarda vetores sem cancelar ILS/visual já autorizado
- Vetores radar (`VETORES` / `RADAR VECTORS`) cancelam STAR + aproximação e mantêm a proa atual
- Aproximação visual (`VISUAL`) com cancelamento e retorno ao ILS; `app.type` no snapshot
- `ALTPISTA` / alterar pista reautoriza o mesmo tipo de APP; RNAV/VOR aceitos no parser com resposta clara se sem carta
- Atalhos contextuais na chegada; ajuda e contrato MP atualizados
- Módulo `engine/approach.js` (Procedure / Nav / Approach managers)
- `REPORTE AEROPORTO` / airport-in-sight (auto ≤ ~22 NM; exigido para VISUAL se longe)
- SPEC: `docs/SPECS/gameplay/approach-and-runway-reassignment.md`

## [0.8.0] — 2026-07-18

### Padronização DCT
- A interface passou a apresentar **DCT** (Direct) como abreviação oficial para direto ao fixo
- `DIR` continua aceito como alias de compatibilidade; linguagem natural (`DIRECT`, `DIRETO`, `prossiga direto`, etc.) segue produzindo a mesma instrução interna (`cmdDirect`)
- Ajuda, dica de comando e clique/toque em fixo no radar montam `DCT` em vez de `DIR`

### Livrar a pista (runway vacating)
- Novo comando `LIVRAR` / fraseologia ICAO (`LIVRE A PISTA`, `VACATE RUNWAY`, lados e “quando possível”)
- Após pouso ou RTO a aeronave permanece na pista até autorização; alinhada também pode livrar com o mesmo comando
- Atalhos contextuais no painel quando a aeronave ocupa a pista; domínio TWR no multiplayer
- Menu de ajuda atualizado com `LIVRAR` / `VACATE` e o novo fluxo pós-pouso/RTO

### Aguarde e informações ATC (standby)
- Comandos `AGUARDE` / `STANDBY` (tráfego, emergência, instruções) e `PREVISAO` / `EXPECT` (aproximação, pouso, decolagem, autorização)
- Atalhos contextuais só quando o piloto tem solicitação pendente; a IA respeita a espera e só pede atualização depois
- Emergências deixam de repetir MAYDAY no rádio após a declaração; contato ATC marca reconhecimento
- Menu de ajuda atualizado com `AGUARDE` / `STANDBY` e `PREVISAO` / `EXPECT`

### Readback e erros do piloto
- Recusas passam a distinguir **erro de entrada** (fixo/SID/STAR/pista/valor inexistente → mensagem diagnóstica) de **erro operacional** (fase/tipo/performance → fraseologia de piloto)
- Mecanismo único `PilotReply` (`errKind: input|ops`) usado por HOLD, DCT, SID, STAR, ILS e demais comandos
- Menu de ajuda atualizado com o comportamento das negativas

### Fraseologia radiotelefônica (callsigns)
- No rádio/TTS, voos comerciais usam o designativo da empresa + números individuais (`GLO1234` → “Gol Um Dois Três Quatro”), sem soletrar o prefixo em ICAO
- Matrículas e letras sem operador conhecido usam o alfabeto fonético ICAO (`PT-ABC` → Papa Tango…)
- Módulo `engine/radio_phrase.js`; strips/parser/engine mantêm o ID textual; menu de ajuda atualizado

### Regras de separação
- Separação radar passa a consultar regras do aeroporto (`separation` no JSON) via `engine/separation.js`
- Operações paralelas válidas (aproximações independentes, decolagens simultâneas, pouso+decolagem) não geram STCA, alarme nem perda de pontos
- SBCV declara strips N/S com operações paralelas independentes; a engine permanece genérica
- Menu de ajuda atualizado

### Hover (helicópteros)
- Novo estado de voo pairado sob instrução ATC (`HOVER`), exclusivo de helicópteros e independente de `ESPERA`/HOLD
- Parser aceita pt/en (`Mantenha posição`, `Permaneça pairado`, `Hold position`, `Maintain hover`, …); atalho contextual **Hover** / **Prosseguir**
- Qualquer autorização de navegação (`DCT`, `P`, `CRZ`, `PROSSEGUIR`, …) encerra o hover; altitude ainda pode ser ajustada enquanto pairado
- Snapshot MP inclui `hovering` / `hoverPos` / `hoverHdg`; ajuda e contrato atualizados

### Holding Pattern (racetrack)
- `HOLD`/`ESPERA` passa de órbita circular para circuito racetrack (pernas + curvas de 180°), módulo `engine/holding.js`
- Curvas à direita (padrão) ou esquerda; entrada Direct na v1 (parallel/teardrop previstos na arquitetura)
- Aliases pt/en (`Aguarde sobre…`, `Entre em espera…`, `Hold over…`); radar desenha o hipódromo alinhado ao procedimento
- Vetores/`DCT`/`VIA`/`ILS`/etc. encerram a espera; altitude/velocidade podem ser ajustadas durante o circuito

---

## [0.7.0] — 2026-07-17

### Parser ATC natural
- O parser passou a aceitar fraseologia natural em pt-BR e inglês, sem quebrar a sintaxe curta já existente
- Comandos como `CLIMB TO FL170`, `HEADING 270`, `DIRECT GOMES`, `CLEARED TO LAND` e `CLEARED FOR TAKEOFF` agora são convertidos para a mesma representação canônica usada internamente pela engine
- A camada de interpretação foi organizada por dicionários de palavras, sinônimos e abreviações, facilitando futuras expansões de idioma e fraseologia

### Condicionais
- Condicionais naturais como `AO ATINGIR FL120`, `DEIXANDO 5000 PÉS` e `NIVELADO FL080` passaram a ser aceitas
- O motor agora diferencia melhor condicionais por cruzamento, deixando e nivelado, preservando a semântica esperada pelo comando do controlador

### UX e ajuda
- O menu de ajuda foi atualizado com exemplos de fraseologia natural, pt/en e novas formas condicionais

### Emergências
- A correção anterior de realismo das emergências foi incorporada ao histórico versionado

### Commits desta versão
- `0e3ead3` — `fix: restringir contexto de emergências e atualizar versao`

---

## [0.6.1] — 2026-07-17

### Controle de versão
- O app passou a ler a versão atual diretamente do topo do `version.md`
- A versão atual agora aparece no topo da interface e na tela inicial, mantendo o build sincronizado com o changelog

### UX
- Modal de ajuda alargada, com mais espaço para a coluna de descrição e quebra de linha adequada na coluna de comandos

### Emergências
- Sorteio de emergências inesperadas ganhou regras contextuais por tipo
- Casos como `PAN PAN` por problema no trem de pouso muito longe do aeródromo deixaram de ser elegíveis aleatoriamente
- Tipos ligados à fase terminal, como trem de pouso, flaps, bird strike e windshear, agora respeitam melhor distância/altitude/fase plausível

### Commits desta versão
- `3cb7a67` — `feat: exibir versao atual e ajustar modal de ajuda`
- `5dbd82f` — `docs: adicionar changelog consolidado em version.md`

---

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
