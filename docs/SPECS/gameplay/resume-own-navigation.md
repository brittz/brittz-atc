# Feature: Resume Own Navigation

## Objetivo

Autorizar a aeronave a retomar a navegação planejada (STAR/SID) após vetores, proa, DCT ou outro desvio, recalculando o reingresso a partir da posição atual.

---

# Comportamento (v1)

- Preserva `flightPlan` ({ type, name, route }) ao sair da rota (vetores, cancel STAR, proa, etc.).
- `RESUME` / aliases pt-en → `Approach.resumeOwnNavigation`.
- Reingressa pelo fixo mais próximo da rota planejada (`nearestOf`).
- Se já estiver seguindo o plano, apenas confirma.
- Botão **Retomar navegação** só quando `Approach.canResume(ac)`.

Navigation Planner em `engine/approach.js`.

---

# Critérios

- Comando e botão; abandona hdg/hold; recalcula rota; parser pt/en; aparece só quando aplicável.
