# Feature: Runway Vacating

## Objetivo

Permitir que o controlador autorize uma aeronave a livrar a pista utilizando comandos compatíveis com a fraseologia aeronáutica.

A funcionalidade deverá ser utilizada principalmente após:

* pouso;
* decolagem rejeitada (RTO);
* cancelamento da decolagem antes da corrida;
* aeronave alinhada aguardando instruções;
* qualquer situação em que a aeronave permaneça ocupando a pista.

---

# Motivação

Atualmente existem situações em que a aeronave permanece sobre a pista aguardando novas instruções.

Na operação real, o controlador normalmente instrui a aeronave a livrar a pista utilizando a saída disponível ou determinada direção.

Essa comunicação deve fazer parte da operação normal do jogo.

---

# Fraseologia

A implementação deverá utilizar fraseologia compatível com ICAO sempre que possível.

Exemplos aceitos pelo parser:

Português

* Livre a pista.
* Livre a pista pela próxima.
* Livre a pista à esquerda.
* Livre a pista à direita.
* Livre a pista quando possível.

Inglês

* Vacate runway.
* Vacate runway left.
* Vacate runway right.
* Vacate when able.
* Exit runway when able.

As diferentes formas deverão produzir exatamente a mesma representação interna.

Comando canônico: `LIVRAR` · opcionalmente `L` / `R` / `NEXT` / `ABLE`.

---

# Comandos rápidos

Quando uma aeronave estiver ocupando a pista, a interface poderá apresentar atalhos contextuais.

Exemplos:

* Livrar pista
* Livrar à esquerda
* Livrar à direita
* Livrar quando possível

Esses atalhos somente deverão aparecer quando fizerem sentido operacionalmente.

---

# Comportamento da aeronave

Ao receber a autorização, a aeronave deverá:

* identificar a primeira saída compatível;
* abandonar a pista de forma segura;
* informar pista livre quando apropriado;
* prosseguir conforme a operação normal.

Caso exista mais de uma saída possível, a lógica poderá utilizar a mais adequada conforme futuras evoluções da IA.

Estados que aceitam a autorização:

* `lineup` — abandona a pista e taxia de volta à cabeceira;
* `abort` — após frenagem, taxia de volta (RTO);
* `rollout` — após desacelerar, livra e encerra a chegada.

Sem autorização, a aeronave permanece na pista (ocupando-a) após pouso ou RTO.

---

# Situações suportadas

O sistema deverá funcionar para:

* aeronaves após o pouso;
* aeronaves após RTO;
* aeronaves alinhadas cuja decolagem tenha sido cancelada;
* futuras operações especiais.

---

# Arquitetura

A lógica não deverá depender da origem da situação.

O comando representa apenas uma autorização para abandonar a pista.

A aeronave decidirá como executá-la conforme seu estado operacional.

---

# Compatibilidade

* Desktop
* Mobile
* Single-player
* Multiplayer

---

# Critérios de aceitação

* O controlador pode autorizar a aeronave a livrar a pista.
* O parser aceita português e inglês.
* O parser aceita diferentes formas de fraseologia.
* A aeronave abandona a pista de forma segura.
* A lógica é reutilizável para diferentes estados da aeronave.
* O sistema permanece compatível com futuras expansões.
* Atualizar o menu de ajuda do jogo.
* Atualizar version.md e versão.
