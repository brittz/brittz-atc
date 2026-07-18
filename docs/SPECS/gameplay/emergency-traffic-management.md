# Feature: Emergency Traffic Management

## Objetivo

Gerenciar o tráfego durante emergências de forma contextual: o aeroporto continua operando quando for seguro, restringindo apenas operações em conflito com a aeronave em emergência.

Complementa **Airport Emergency Response**, **Separation Rules** e **Runway State Manager**.

---

# Motivação

A declaração de emergência não fechava o aeroporto na operação real, mas a engine bloqueava decolagens de forma ampla (ex.: severidade alta em qualquer pista).

---

# Princípios

Emergência ≠ fechamento total.

Restrições vêm de análise de contexto (pista, fase, distância, estado da pista, separação paralela).

Prioridade da emergência sem exclusividade desnecessária.

---

# Módulo

`engine/emergency_traffic.js` — **Emergency Traffic Manager**

Único ponto que decide bloquear/liberar decolagem (e informa motivo) por causa de emergência.
`GameCore.shouldHoldDeparture` / `departureHoldReason` delegam a este módulo.

Consulta:

* Separation (`parallelOps` / mixed arrival-departure);
* RunwayState (bloqueio/inspeção);
* `emergencyRunwayBlock` pós-pouso;
* posição/fase/severidade da aeronave em emergência.

---

# Regras v1

## Mesma faixa (strip)

* Bloqueia decolagem se emergência está em final/landing/post-landing, na pista, ou a menos de ~12 NM em aproximação.
* Longe (> ~18 NM) e ainda não em APP: permite (restrição temporária quando se aproximar).

## Faixa paralela independente

* Se `DATA.SEPARATION.parallelOps` declara `mixedArrivalDeparture` (ou grupo equivalente), **permite** decolagem/pouso na paralela enquanto a emergência usa a outra faixa.
* Sem independência declarada: trata como dependente (restringe quando a emergência está próxima).

## Bloqueio físico

* Pista `blocked` / `inspecting` / `cleared` (até) via RunwayState → indisponível.
* `emergencyRunwayBlock` no mesmo pair → indisponível.

---

# Comunicação

Recusas de decolagem usam motivo explícito (temporário quando aplicável).

---

# Critérios

* Emergência não bloqueia automaticamente todas as operações.
* Paralelas independentes (SBCV N/S) continuam quando seguras.
* Restrições dinâmicas conforme distância/fase.
* Motivo informado ao controlador/piloto.
