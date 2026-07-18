# Feature: Position Report System

## Objetivo
Permitir que o controlador solicite que uma aeronave volte a estabelecer contato quando atingir uma condição operacional específica, reduzindo comunicações desnecessárias e aproximando a simulação da operação real.

O sistema deve ser genérico e reutilizável para qualquer tipo de aeronave e fase do voo.

---

# Motivação
Atualmente algumas aeronaves entram em contato muito antes de realmente necessitarem de instruções, como helicópteros chamando a aproximadamente 20 NM do aeródromo.

Na prática, o controlador normalmente solicita que a aeronave reporte novamente em uma posição, distância ou condição específica.

Essa mecânica reduz a carga de trabalho do controlador e aumenta o realismo da comunicação.

---

# Casos de uso

## Por distância
Exemplos:

- Reporte a 5 NM do aeródromo.
- Reporte a 10 NM.

---

## Por fixo
Exemplos:

- Reporte sobre NITUS.
- Reporte ao cruzar PONTE.

---

## Por altitude
Exemplos:

- Reporte deixando 5000 pés.
- Reporte atingindo 3000 pés.

---

## Por nível de voo
Exemplos:

- Reporte deixando FL150.
- Reporte nivelado no FL080.

---

# Fluxo operacional
Exemplo:

Piloto:

> Rio Torre, PRH01, 20 milhas ao sul, 1500 pés.
Controlador:

> PRH01, reporte a 5 milhas do aeródromo.
A aeronave continua normalmente sua navegação.

Quando atingir aproximadamente 5 NM:

Piloto:

> Rio Torre, PRH01, 5 milhas ao sul.
O reporte solicitado é considerado concluído.

---

# Comportamento da IA
Ao receber um pedido de reporte, a aeronave deve:

- registrar a condição solicitada;
- continuar executando normalmente sua navegação;
- monitorar continuamente a condição;
- realizar automaticamente a chamada quando a condição for satisfeita;
- remover o reporte pendente após sua execução.
Enquanto existir um reporte pendente, a aeronave não deve realizar novas chamadas desnecessárias relacionadas ao mesmo contexto.

---

# Interface
A funcionalidade deve permanecer compatível com desktop e dispositivos móveis.

A implementação poderá utilizar:

- comandos textuais;
- atalhos rápidos;
- botões contextuais.
A interface deve permitir futura expansão para novos tipos de reporte.

---

# Helicópteros
Os helicópteros passam a utilizar esta mecânica.

Em vez de permanecerem aguardando instruções após o primeiro contato distante do aeródromo, o controlador poderá solicitar, por exemplo:

> Reporte a 5 NM do aeródromo.
Isso reduz comunicações desnecessárias sem alterar o restante da operação.

---

# Compatibilidade
O sistema deverá funcionar para:

- helicópteros;
- aeronaves VFR;
- aeronaves IFR;
- voos locais;
- circuito de tráfego;
- single-player;
- multiplayer.

---

# Arquitetura
O sistema deve ser genérico.

Não deve existir lógica específica para helicópteros.

Novos tipos de condição devem poder ser adicionados sem modificar a arquitetura existente.

---

# Critérios de aceitação

- O controlador pode solicitar um reporte futuro.
- A aeronave memoriza a solicitação.
- A aeronave continua normalmente seu voo.
- O reporte ocorre automaticamente quando a condição é satisfeita.
- O reporte pendente é removido após sua execução.
- O sistema suporta, no mínimo:

- distância;
- fixo;
- altitude;
- nível de voo.
- A arquitetura permite adicionar novos tipos de reporte futuramente.
