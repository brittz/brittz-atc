# Feature: Radiotelephony Phraseology

## Objetivo

Aprimorar a comunicação entre pilotos e controlador utilizando fraseologia aeronáutica mais próxima dos padrões ICAO.

A primeira etapa desta funcionalidade consiste em melhorar a pronúncia dos designativos de chamada (callsigns), utilizando o callsign radiotelefônico da empresa e a leitura correta dos números.

A arquitetura deverá permitir futuras expansões para toda a fraseologia do jogo.

---

# Motivação

Atualmente os pilotos utilizam o callsign textual do voo.

Exemplo:

> GLO1234

Embora funcional, essa representação não corresponde à comunicação utilizada na aviação.

A comunicação deve soar como uma transmissão de rádio real.

---

# Princípios

O piloto nunca deve pronunciar o código textual da aeronave (ex.: “G L O um dois…”).

O designativo deverá ser convertido automaticamente para sua representação radiotelefônica.

O restante da engine continuará trabalhando normalmente com o identificador original do voo (`GLO1234`).

---

# Conversão do callsign

## Empresa (operador conhecido)

O prefixo da empresa **não** usa o alfabeto fonético ICAO.

Ele é substituído pelo callsign radiotelefônico oficial (campo `radio` em `DATA.AIRLINES` / configuração).

Exemplos:

| Prefixo | Rádio (configurável) |
|---|---|
| GLO | Gol |
| AZU | Azul |
| TAM | LATAM (ou TAM, conforme config) |
| FAB | Força Aérea |

Outras empresas poderão ser adicionadas através de configuração, sem alterar a lógica.

---

## Números

Os números do sufixo do voo são pronunciados **individualmente**.

Exemplo:

1234 → Uno Dois Três Quatro (pt) · One Two Three Four (en)

> Em português aeronáutico brasileiro: **Uno** (1) e **Meia** (6), não “um”/“seis”.
> A síntese de voz (`VoicePhrase`) aplica regras adicionais — ver **Voice Radiotelephony**.

---

## Exemplos completos

| Interno | Comunicação (pt) |
|---|---|
| GLO1234 | Gol Uno Dois Três Quatro |
| AZU4512 | Azul Quatro Cinco Uno Dois |
| TAM3271 | LATAM Três Dois Sete Uno |

**Não** se fala “Golf Lima Oscar One Two Three Four”.

---

## Quando usar o alfabeto fonético ICAO

O alfabeto ICAO entra quando há **letras que não representam um operador conhecido**, por exemplo:

* matrículas: `PT-ABC` → Papa Tango Alpha Bravo Charlie
* identificadores alfanuméricos sem callsign publicado
* prefixos desconhecidos (cada letra soletrada + números individuais)

Isso evita que todos os voos comerciais soem artificiais.

---

# Idiomas

O sistema deverá suportar, no mínimo:

* Português
* Inglês

A arquitetura deverá permitir novos idiomas futuramente.

O jogo (voz/UI) usa pt-BR por padrão; a API aceita `lang: 'en'`.

---

# Utilização

A conversão ocorre na **camada de comunicação** (log de rádio + TTS):

* primeiro contato, readback, emergências, arremetidas, transferências, reportes, solicitações
* transmissões do controlador que endereçam a aeronave pelo callsign

Strips, radar, parser e snapshots continuam com o identificador original.

---

# Arquitetura

Módulo `engine/radio_phrase.js` (`RadioPhrase`):

* `speakCallsign(cs, { radio?, lang? })` — texto radiotelefônico
* tabelas de dígitos e alfabeto ICAO expansíveis
* operadores via `DATA.AIRLINES` (+ extras configuráveis no módulo)

Novos operadores, idiomas e regras de pronúncia podem ser adicionados sem modificar a lógica principal do motor.

---

# Compatibilidade

* Desktop
* Mobile
* Single-player
* Multiplayer

---

# Critérios de aceitação

* O callsign textual deixa de ser pronunciado/exibido diretamente no rádio.
* Empresas utilizam seus designativos radiotelefônicos (não soletram o prefixo ICAO).
* Os números são pronunciados individualmente.
* O alfabeto fonético ICAO é usado para matrículas / letras sem operador conhecido.
* A engine permanece utilizando os identificadores originais.
* A arquitetura permite expansão futura.
* Menu de ajuda e `version.md` (RC) atualizados.
