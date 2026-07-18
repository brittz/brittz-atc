# Feature: Separation Rules

## Objetivo

Implementar um sistema de regras de separação mais fiel aos procedimentos reais de controle de tráfego aéreo, permitindo que o motor da simulação considere exceções operacionais válidas antes de gerar conflitos, alarmes ou penalizações.

O objetivo é substituir a regra fixa atual por um mecanismo baseado no contexto operacional.

---

# Motivação

Atualmente toda perda de separação é tratada da mesma forma (salvo uma exceção hardcoded para ILS paralelo estabelecido).

Isso produz falsas violações em situações válidas na operação real, como aproximações e decolagens paralelas conduzidas conforme os procedimentos do aeroporto.

Além de alarmes indevidos, o jogador perde pontuação mesmo realizando uma operação correta.

---

# Princípios

A separação entre aeronaves deve depender do contexto operacional.

Antes de gerar um alerta ou aplicar penalidades, o sistema deverá avaliar fase do voo, tipo de operação, pista, procedimentos e **regras do aeroporto**.

A distância entre aeronaves não deve ser o único critério de decisão.

---

# Arquitetura

A lógica de separação é orientada por regras no módulo `engine/separation.js`.

A engine consulta `DATA.SEPARATION` (carregado do JSON do aeroporto) antes de concluir perda de separação.

**As regras não ficam hardcoded na engine** — fazem parte da definição do aeroporto, como pistas, SIDs e STARs.

Novas regras podem ser adicionadas futuramente sem alterar o algoritmo principal de varredura.

---

# Configuração por aeroporto

Exemplo (SBCV):

```json
"separation": {
  "radarNm": 3,
  "radarFt": 1000,
  "predictNm": 3.2,
  "parallelOps": [
    {
      "id": "NS",
      "strips": ["N", "S"],
      "independentApproaches": true,
      "simultaneousTakeoffs": true,
      "mixedArrivalDeparture": true
    }
  ]
}
```

`strips` refere-se aos valores de `rwyPair` (cada asfalto paralelo).

Campos previstos / expansíveis:

* existência de pistas paralelas (`parallelOps`);
* aproximações independentes / dependentes;
* decolagens simultâneas;
* pouso + decolagem simultâneos;
* (futuro) turbulência de esteira, LVP, pistas cruzadas/convergentes, etc.

---

# Operações paralelas

Quando o aeroporto declara operações paralelas válidas, o motor **não** emite conflito/alarme/penalidade para pares cobertos pela regra, por exemplo:

* duas aproximações em pistas de strips distintos (`independentApproaches`);
* duas decolagens iniciais em strips distintos (`simultaneousTakeoffs`);
* chegada numa strip e saída na paralela (`mixedArrivalDeparture`).

Aeronaves na **mesma** strip (mesmo `rwyPair`) continuam sujeitas à separação radar padrão.

**Decolagem inicial:** a isenção de `simultaneousTakeoffs` vale enquanto ambos os deps
estão airborne (> 400 ft) e o mais afastado do aeródromo ainda está dentro da bolha
(~15 NM). Não se usa só um teto baixo de altitude: paralelas próximas (ex.: SBCV N/S
~0.8 NM) permanecem dentro da separação radar na proa de pista após 3500 ft — um
teto antigo gerava alarme/STCA falso em decolagens simultâneas válidas.

---

# Alarmes e penalização

Somente situações que falham nas regras aplicáveis geram:

* STCA / linhas de conflito;
* alarme sonoro;
* contagem `sepLoss` e perda de pontos.

---

# Compatibilidade

* Desktop · Mobile · Single-player · Multiplayer

---

# Critérios de aceitação

* O sistema deixa de usar apenas distância (e a exceção hardcoded) como critério.
* Alarmes só quando houver perda real segundo as regras do aeroporto.
* Operações paralelas válidas não geram alarmes nem penalizações.
* Cada aeroporto define suas regras no JSON.
* A arquitetura permite novas regras sem reescrever o laço principal.
* Menu de ajuda e `version.md` (RC) atualizados.
