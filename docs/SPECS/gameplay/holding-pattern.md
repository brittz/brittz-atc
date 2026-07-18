# Feature: Holding Pattern

## Objetivo

Implementar o procedimento de espera (Holding Pattern) utilizando o padrão racetrack (hipódromo), substituindo o comportamento anterior de órbita circular.

A implementação reproduz o comportamento operacional da aviação e permite expansões futuras (entradas, sentidos, esperas publicadas).

---

# Motivação

O HOLD antigo fazia órbita circular sobre o fixo. Na operação real, a espera é um circuito com duas pernas retas e curvas de 180° (racetrack).

---

# Princípios

Procedimento previsível; a aeronave repete o circuito até nova autorização.

Comportamento idêntico para asa fixa, respeitando desempenho (taxa de curva / velocidade).

Lógica de trajetória isolada em `engine/holding.js` — independente do parser e da UI.

---

# Estrutura

Cada circuito:

1. perna inbound (rumo ao fixo);
2. curva de 180°;
3. perna outbound;
4. curva de 180°.

Repete indefinidamente.

---

# Fixo e sentido

HOLD exige fixo válido (waypoint / VOR / NDB / fixo do espaço aéreo).

Curvas: **direita** (padrão) ou **esquerda** (`HOLD … RIGHT|LEFT` / `DIREITA|ESQUERDA`).

Inbound course: na ausência de carta publicada, usa o rumo atual da aeronave **para** o fixo no momento da instrução.

---

# Entradas (arquitetura)

Campo `entry`: `direct` | `parallel` | `teardrop`.

**v1:** sempre Direct Entry (voar ao fixo e engatar o circuito). Parallel/Teardrop reservados sem reescrever o módulo.

---

# Tempo das pernas

`legSec` configurável (padrão engine: **60 s**). Futuro: altitude, vento, DME, carta.

---

# Navegação

Na espera: mantém altitude e velocidade autorizadas; permanece no rádio.

**Encerramento:** qualquer autorização lateral / de procedimento (`DCT`, vetores/`P`, `VIA`, `ILS`, `STAR`, `SID`, `CRZ`, `PROSSEGUIR`, …).

Altitude e velocidade **não** encerram o HOLD (podem ser ajustadas durante a espera).

---

# Comandos

Canônico: `ESPERA FIXO` / `HOLD FIXO` · opcional `LEFT`/`RIGHT`.

Aliases: Aguarde sobre…, Entre em espera…, Mantenha espera…, Hold over…, Enter holding…

---

# Interface

No radar, o HOLD selecionado (ou em geral) desenha o **racetrack** alinhado ao inbound/turn — não um círculo.

---

# Critérios de aceitação

* Órbita circular substituída por racetrack.
* Permanece até nova autorização de navegação/procedimento.
* Parser pt/en; suporte L/R.
* Arquitetura prevê 3 entradas ICAO (v1 = direct).
* Circuito visível no mapa; expansível sem remodelar o core.
