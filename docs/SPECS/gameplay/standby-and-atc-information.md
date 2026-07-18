# Feature: Standby and ATC Information

## Objetivo

Permitir que o controlador responda adequadamente às solicitações dos pilotos quando ainda não puder fornecer a autorização ou informação solicitada.

O sistema deve suportar respostas de espera, informações operacionais e previsões, reduzindo o silêncio no rádio e aproximando a simulação da fraseologia utilizada no controle de tráfego aéreo.

---

# Motivação

Hoje existem situações em que o piloto faz uma solicitação legítima e o controlador não possui uma resposta adequada.

Exemplos:

* previsão para aproximação;
* previsão para pouso;
* previsão para decolagem;
* aguardar devido ao tráfego;
* aguardar devido a uma emergência.

Nesses casos o controlador deveria conseguir responder imediatamente, mantendo a comunicação fluindo normalmente.

---

# Situações

O sistema deverá funcionar independentemente de existir uma emergência.

Exemplos:

* tráfego intenso;
* aeronave em espera;
* vetoração;
* congestionamento da pista;
* emergência em andamento;
* qualquer situação em que o controlador ainda não possa emitir a autorização solicitada.

---

# Comandos

O parser deverá aceitar diferentes formas da mesma intenção.

## Aguarde

Português

* Aguarde.
* Aguarde instruções.
* Permaneça em escuta.
* Aguarde devido ao tráfego.
* Aguarde devido à emergência.

Inglês

* Stand by.
* Stand by for instructions.
* Remain this frequency.
* Stand by due traffic.
* Stand by due emergency.

Canônico: `AGUARDE` · opcional `TRAFFIC` | `EMERGENCY` | `INSTR`.

---

## Informações / previsões

Canônico: `PREVISAO` + `APP` | `LAND` | `TO` | `CLR`

Exemplos:

* previsão para aproximação / expect approach;
* previsão para pouso / expect landing;
* previsão para decolagem / expect takeoff;
* previsão para autorização / expect clearance;
* atraso devido ao tráfego / delay due traffic → `AGUARDE TRAFFIC`;
* atraso devido à emergência / delay due emergency → `AGUARDE EMERGENCY`.

---

# Interface

Quando uma aeronave realizar uma pergunta compatível, deverão aparecer atalhos contextuais.

Exemplos:

* Aguarde
* Aguarde - Tráfego
* Aguarde - Emergência
* Aproximação em breve
* Pouso em breve
* Autorização em breve

Esses atalhos não deverão ficar visíveis permanentemente.

Devem aparecer apenas quando fizerem sentido operacionalmente (`pilotAi.pendingAsk`).

---

# IA dos pilotos

Após receber uma resposta de espera, o piloto deverá:

* reconhecer a instrução;
* aguardar novas instruções;
* evitar repetir a mesma solicitação continuamente.

Caso o tempo de espera seja excessivo, a aeronave poderá realizar um novo contato solicitando atualização.

O intervalo deverá ser compatível com a situação operacional.

---

# Emergências

Durante uma emergência, a frequência deve permanecer limpa.

A aeronave em emergência não deve repetir continuamente mensagens de MAYDAY depois que o controlador já reconheceu a situação.

Após o reconhecimento inicial, novas transmissões deverão ocorrer apenas quando houver informação operacional relevante.

---

# Compatibilidade

* Desktop
* Mobile
* Single-player
* Multiplayer

---

# Critérios de aceitação

* O controlador pode mandar uma aeronave aguardar.
* O controlador pode informar que uma autorização será emitida posteriormente.
* A IA reduz comunicações repetitivas.
* Emergências deixam de gerar chamadas redundantes de MAYDAY.
* A aeronave volta a chamar apenas quando apropriado.
* Os atalhos aparecem apenas quando fizerem sentido operacionalmente.
* O parser aceita português e inglês.
* Atualizar o menu de ajuda do jogo.
* Atualizar version.md (versão aberta até o commit).
