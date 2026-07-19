# Feature: Painel de Informações da Aeronave

## Objetivo

Evoluir o painel de informações da aeronave selecionada (`selPanel`) de um resumo
enxuto para uma ferramenta de decisão mais completa: reúne as informações
operacionais relevantes para a fase atual do voo e oferece atalhos que reduzem a
digitação de comandos. A arquitetura deve permitir acrescentar novos campos e
ações no futuro sem reescrever o painel.

---

## Motivação

O controlador consulta as mesmas informações da aeronave o tempo todo (origem,
destino, tipo, procedimento ativo, pista prevista). Tê-las consolidadas em um só
lugar acelera a decisão.

No celular, informação demais estoura o cartão. A solução é um cartão de tamanho
normal (o essencial) com um botão **expandir** para as informações adicionais.
Os cartões de aeronaves em emergência já são grandes: as informações extras
devem ser **opcionais/expansíveis** para não sobrecarregar.

---

## Princípios

- Mostrar apenas a informação relevante para a operação atual.
- Atualizar automaticamente quando o estado da aeronave muda.
- As ações devem reduzir a quantidade de interações para emitir comandos.
- Emergência: não inchar o cartão; a informação adicional fica em uma área
  opcional/expansível.

---

## Informações mínimas

O painel deve reunir (quando aplicável à fase do voo):

- **Identificação:** indicativo (callsign), companhia/operador, tipo de aeronave
  (e categoria de esteira).
- **Plano de voo:** origem, destino, SID/STAR ativa, procedimento de aproximação
  ativo, pista prevista (pouso ou decolagem).
- **Operação:** altitude / velocidade / proa atuais, estado do voo, ETA para o
  pouso (quando aplicável).

A arquitetura precisa permitir adicionar campos depois (ver *Expansão futura*).

---

## ETA (tempo estimado para o pouso)

Estimar o tempo até o pouso quando a aeronave está no ar, a partir de:

- posição atual;
- velocidade atual (groundspeed ≈ IAS na simulação);
- distância restante (ao longo da rota/aproximação até a cabeceira prevista);
- procedimento ativo.

A estimativa é **aproximada** (não precisa ser exata). Quando não houver dados
confiáveis (aeronave no solo, velocidade muito baixa, saída, ou distância
indeterminada), exibir `N/D`.

---

## Inserção automática do indicativo (callsign)

Clicar no indicativo em qualquer lugar da interface insere-o na caixa de comando:

- Copia o indicativo para a entrada de comando.
- Cursor no fim do texto (desktop).
- Mantém o foco na entrada (desktop).
- **Celular/toque:** **não** abrir o teclado do sistema / **não** forçar o foco
  (mantém a proteção mobile já existente na UI).
- Preserva o texto após o indicativo quando aplicável.

### Comportamento

- Caixa vazia → insere só o indicativo.
- Mesmo indicativo já presente → mantém / concatena as edições (não apaga o que
  já foi digitado para aquela aeronave).
- Indicativo diferente → limpa e substitui (comando de outra aeronave é
  descartado).
- Exemplo: a caixa contém `HDG 180`; ao clicar em `GLO1234`, a caixa passa a
  conter `GLO1234 ` (o comando pendente de outra aeronave é substituído).

### Áreas

Funciona onde quer que o indicativo seja clicável — de forma consistente e
reutilizável (mesma ação, sem duplicar lógica):

- painel de seleção (`selPanel`);
- rótulos (labels) no radar;
- lista de tráfego (strips);
- mensagens de rádio / histórico de comunicações;
- notificações.

---

## Grupos da UI

O painel organiza as informações em grupos:

- **Identificação** — indicativo, companhia, tipo/esteira.
- **Plano de voo** — origem, destino, SID/STAR, aproximação, pista prevista.
- **Operação** — ALT/VEL/PROA, estado do voo, ETA.

No celular: cartão compacto (essencial sempre visível) + botão **expandir** para
os grupos adicionais. As informações da emergência entram na área expansível.

---

## Arquitetura (crítico)

- O painel **não** consulta a aeronave diretamente para montar os campos: um
  serviço dedicado (`AircraftInfo`) consolida os dados operacionais em um
  *view-model* agrupado, incluindo o ETA. Assim o painel só formata o que o
  serviço entrega, e novos campos entram no serviço.
- A inserção do indicativo passa por uma **ação reutilizável**
  (`UI.insertCallsign`), de modo que qualquer componente da UI use o mesmo
  comportamento sem duplicar código.

`AircraftInfo` é um módulo puro (browser via global `AircraftInfo`; Node via
`module.exports`) e funciona tanto com a instância real de `Aircraft`
(single-player) quanto com a aeronave hidratada do snapshot (multiplayer).

API principal:

```
AircraftInfo.build(ac, ctx) -> {
  id:       { callsign, operator, type, wtc },
  plan:     { origin, dest, sid, star, approach, expectedRwy },
  ops:      { alt, clrAlt, spd, hdg, stateLabel, eta },
  groups:   [ { title, fields: [ { label, value } ] } ],
  compact:  [ { label, value } ],   // essencial (celular)
  emergency: string|null,
}
AircraftInfo.eta(ac, ctx) -> { seconds, text }   // 'N/D' quando indeterminado
```

`ctx` fornece o contexto do jogo sem acoplar o serviço ao core:
`{ arrRwys, depRwys, stateLabel }`.

---

## Compatibilidade

Desktop e celular. No celular a inserção do indicativo ocorre sem abrir o
teclado (respeitando a proteção mobile existente).

---

## Expansão futura

A arquitetura deve permitir acrescentar depois: combustível, categoria, esteira,
operador, frequência, tempo até o destino, distância restante, alternativa,
status de emergência, indicadores de restrição e ações rápidas — sem reescrever
o painel (basta estender `AircraftInfo` e/ou os grupos).

---

## Critérios de aceitação

- O painel mostra origem, destino, tipo, SID, STAR, pista prevista e ETA.
- Atualiza automaticamente durante o voo.
- Clicar em qualquer indicativo insere-o na caixa de comando.
- Não sobrescreve edições em andamento do mesmo indicativo.
- É extensível para novos campos/ações.
