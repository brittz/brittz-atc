# Feature: Pilot Readback and Error Handling

## Objetivo

Melhorar a forma como os pilotos respondem quando uma instrução não pode ser executada.

Em vez de responder apenas "Negativo" ou "Unable", a aeronave deverá informar claramente o motivo da recusa sempre que possível.

O objetivo é aproximar a comunicação da operação real e fornecer feedback útil ao controlador.

---

# Motivação

Atualmente, quando uma instrução é inválida ou não pode ser executada, o piloto normalmente responde apenas com uma negativa genérica concatenada a um texto técnico.

Essa resposta nem sempre deixa claro se o problema é um erro de digitação/entrada do controlador ou uma limitação operacional da aeronave.

---

# Princípios

A IA deve informar a causa da recusa sempre que ela puder ser determinada com segurança.

O piloto nunca deve inventar uma justificativa.

Quando não for possível identificar exatamente o problema, poderá utilizar uma negativa genérica.

---

# Dois grupos de erro

## 1. Erro do controlador (entrada / parser)

O comando foi mal formado ou referencia algo que **não existe** no espaço aéreo carregado (fixo, SID, STAR, pista, valor fora da faixa do jogo).

Nestes casos a resposta é **diagnóstica**, para o jogador corrigir o comando:

* Negativo. Fixo ABCDEF não encontrado.
* Negativo. SID TESTE1 inexistente.
* Negativo. STAR XXXX1 inexistente.
* Negativo. Pista 55 indisponível.
* Negativo. Nível/altitude solicitado indisponível.

`errKind: 'input'`

---

## 2. Erro operacional

O comando foi **entendido**, mas a aeronave não pode cumpri-lo no estado atual (fase do voo, tipo, performance, emergência, prioridade, etc.).

Nestes casos a resposta usa **fraseologia operacional**, sem soar como mensagem de sistema:

* Negativo, já estamos em voo.
* Negativo, impossível na fase atual.
* Negativo, mantendo a proa atual.
* Impossível, nossa mínima atual é 180 nós.
* (mensagens de emergência já existentes)

`errKind: 'ops'`

---

# Casos suportados (exemplos)

| Situação | Grupo | Exemplo de resposta |
|---|---|---|
| HOLD / DCT em fixo inexistente | input | Negativo. Fixo ABCDEF não encontrado. |
| SID / STAR inexistente | input | Negativo. SID TESTE1 inexistente. |
| ILS / DEC pista inexistente | input | Negativo. Pista 55 indisponível. |
| Altitude fora da TMA / valor inválido | input | Negativo. Nível/altitude solicitado indisponível. |
| Decolagem com aeronave em voo | ops | Negativo, já estamos em voo. |
| ILS no solo / pouso sem aproximação | ops | Negativo, impossível na fase atual. |
| Velocidade fora da performance | ops | Impossível, nossa mínima/máxima atual é … |
| Chegada pedindo SID (ou o inverso) | ops | Negativo, somos uma chegada / saída. |

---

# Fraseologia

Sempre que possível utilizar fraseologia curta e objetiva (pt-BR no jogo).

Inglês equivalente pode ser aceito no parser de comandos do controlador; o readback do piloto permanece em pt-BR, alinhado ao restante do rádio.

---

# Interface

As mensagens deverão aparecer normalmente na janela de comunicações.

Nenhuma janela adicional deverá ser exibida.

---

# Arquitetura

Cada resultado de comando pode retornar:

* `{ rb }` — sucesso;
* `{ err, errKind: 'input'|'ops', early? }` — falha com motivo classificado.

`PilotReply` formata o texto do rádio. Novos motivos adicionam mensagens sem mudar o fluxo do `runCommand`.

O parser e a engine permanecem desacoplados: a classificação vive no retorno do comando.

---

# Compatibilidade

* Desktop
* Mobile
* Single-player
* Multiplayer

---

# Critérios de aceitação

* Erros de entrada são diagnósticos (citam fixo/SID/STAR/pista/valor quando possível).
* Erros operacionais usam fraseologia de piloto, sem “Fix not found” genérico indevido.
* HOLD, DCT, SID, STAR, ILS e demais comandos usam o mesmo mecanismo.
* Mensagens continuam curtas e objetivas.
* Menu de ajuda menciona o comportamento quando couber.
* Acumular no `version.md` da RC aberta.
