# ROADMAP

Este documento define a ordem planejada de evolução do Jogo ATC.

A prioridade leva em consideração dependências técnicas, impacto na jogabilidade e redução de retrabalho. A ordem pode ser revisada durante o desenvolvimento.

---

# Fase 1 — Fundação

Objetivo: preparar a arquitetura para suportar as funcionalidades futuras.

## 1. Sistema de Estatísticas

**Status:** Planejado

Criar uma infraestrutura centralizada para registrar eventos da simulação.

Exemplos:

* pousos
* decolagens
* conflitos
* emergências
* horas controladas
* comandos emitidos
* arremetidas
* separações perdidas

Esta será a base para:

* perfil
* conquistas
* recordes
* ranking
* analytics

---

## 2. Sistema de Eventos

**Status:** Planejado

Criar uma arquitetura baseada em eventos para desacoplar a engine.

Exemplos:

* AircraftSpawned
* AircraftLanded
* TakeoffCompleted
* GoAround
* EmergencyDeclared
* EmergencyEnded

As futuras funcionalidades deverão consumir esses eventos ao invés de modificar diretamente a lógica principal.

---

# Fase 2 — Gameplay

Objetivo: aumentar o realismo operacional.

## 3. Sistema de Emergências 2.0

**Status:** Implementado

Principais objetivos:

* comunicação em etapas;
* múltiplos tipos de emergência;
* níveis de gravidade;
* evolução dinâmica;
* alteração do comportamento da aeronave;
* Estado Operacional do Aeroporto.

Documento:

* `docs/SPECS/gameplay/emergency-system-v2.md`

---

## 4. Melhorias na IA dos Pilotos

**Status:** Implementado

Os pilotos deixam de ser executores passivos.

Devem ser capazes de:

* solicitar vetores;
* informar "Unable";
* solicitar pista específica;
* antecipar informações importantes;
* tomar iniciativas compatíveis com a situação.

Essa melhoria beneficia todo o jogo, não apenas as emergências.

---

## 5. Melhorias da Interface Operacional

**Status:** Planejado

Melhorias no selPanel e ferramentas do controlador.

Exemplos:

* origem;
* destino;
* STAR;
* SID;
* tipo da aeronave;
* ETA;
* preenchimento automático do callsign.

---

# Fase 3 — Progressão

Objetivo: incentivar o jogador a continuar evoluindo.

## 6. Perfil do Controlador

* estatísticas
* horas online
* horas offline
* histórico

---

## 7. Conquistas

Sistema de achievements.

---

## 8. Medalhas

Sistema separado de conquistas.

---

## 9. Recordes

Melhores marcas pessoais.

---

# Fase 4 — Conteúdo

Objetivo: enriquecer a simulação.

## 10. Companhias Históricas

Adicionar empresas que marcaram a aviação brasileira e internacional.

Exemplos:

* VARIG
* VASP
* Transbrasil
* Rio Sul
* Panair
* Cruzeiro
* WebJet
* Avianca Brasil
* BRA
* Trip

---

## 11. Expansão dos Cenários

Novos aeroportos, procedimentos e conteúdos.

---

# Fase 5 — Integrações

Objetivo: aproximar a simulação da operação real.

## 12. Integração AISWEB

Importação de dados reais.

Objetivos futuros:

* procedimentos;
* cartas;
* pistas;
* frequências;
* navegação.

---

# Fase 6 — Imersão

Objetivo: aumentar a sensação de estar controlando um aeroporto real.

## 13. Sistema de Voz

Separação entre vozes de controlador e piloto.

Possíveis evoluções:

* múltiplas vozes;
* sotaques;
* diferentes timbres.

---

# Princípios do Projeto

Sempre priorizar:

* realismo operacional;
* simplicidade para o jogador;
* arquitetura extensível;
* compatibilidade com multiplayer;
* compatibilidade com dispositivos móveis;
* baixo acoplamento entre sistemas.

---

# Como desenvolver uma nova funcionalidade

Toda nova feature deve seguir o fluxo abaixo:

1. Discussão da ideia.
2. Especificação funcional (`docs/SPECS`).
3. Revisão da especificação.
4. Prompt de implementação (`docs/PROMPTS`).
5. Implementação.
6. Testes.
7. Ajustes.
8. Atualização da documentação.

Nenhuma funcionalidade complexa deve ser implementada diretamente sem uma especificação prévia.
