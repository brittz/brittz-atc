# Feature: Helicopter Hover Operations

## Objetivo

Permitir que helicópteros recebam instruções específicas de voo pairado (hover), reproduzindo uma das principais diferenças operacionais em relação às aeronaves de asa fixa.

O sistema deverá permitir que o controlador mantenha um helicóptero estacionário em um ponto ou autorize sua continuação quando conveniente.

---

# Motivação

Atualmente os helicópteros utilizam praticamente o mesmo conjunto de instruções das aeronaves convencionais.

Na operação real, o controlador pode solicitar que um helicóptero permaneça pairando até que exista condição para prosseguir.

---

# Princípios

O voo pairado é exclusivo de helicópteros.

Independente do procedimento de espera (HOLD/ESPERA), que continua existindo para todos os tipos.

**Fraseologia padrão na interface:** `HOVER` (e atalho “Hover”).  
Aliases aceitos pelo parser: “Mantenha posição”, “Permaneça pairado”, “Hold position”, “Maintain hover”, etc.  
(“Hold position” em solo/pista fica ambíguo; no ar, para helicóptero, mapeia para Hover.)

---

# Estado de Hover

Flag `hovering` (helicóptero em voo).

Enquanto pairado:

* mantém posição geográfica;
* mantém altitude, salvo nova instrução de altitude;
* mantém proa atual (salvo vetor);
* aguarda novas instruções;
* permanece no rádio.

---

# Comandos

Canônico: `HOVER`

Aliases (pt/en): Pairado, Paire, Mantenha posição, Permaneça pairado, Hover, Hold position, Maintain hover, Remain in hover.

## Continuação

`PROSSEGUIR` / `CONTINUE` / `PROSSIGA` (sem fixo) retoma a navegação VFR.  
Qualquer instrução lateral (DCT, P, VIA, ESPERA, CRZ, …) encerra o Hover automaticamente.

---

# Critérios de aceitação

* Apenas helicópteros recebem Hover.
* Permanece estacionário até nova instrução de navegação.
* Parser pt/en; UI apresenta **HOVER**.
* Compatível desktop/mobile/SP/MP.
* Ajuda e `version.md` (RC) atualizados.
