# Feature: Voice Radiotelephony

## Objetivo

Aprimorar a geração das transmissões de voz da IA, garantindo aderência à fraseologia aeronáutica utilizada nas comunicações ATC.

O sistema deverá produzir mensagens compatíveis com a radiotelefonia utilizada na aviação civil brasileira, permitindo futura expansão para outros idiomas e países.

Esta especificação complementa a **Radiotelephony Phraseology**, tratando especificamente da geração da fala (TTS).

---

# Motivação

Atualmente algumas transmissões utilizam pronúncias literais ou incorretas, reduzindo o realismo da comunicação.

Exemplos observados:

* "Zero Nove Litros"
* "Whisxkey Ei Shirai"
* "Um"
* "Seis"
* "Helicóptero"

Embora a estrutura das mensagens esteja correta, a pronúncia precisa seguir a fraseologia aeronáutica.

---

# Princípios

A geração da voz deverá ser baseada em regras de radiotelefonia e não na simples leitura do texto.

A representação interna dos dados poderá permanecer inalterada.

A conversão ocorrerá apenas na camada responsável pela síntese de voz.

---

# Números

Os números deverão utilizar a fraseologia aeronáutica brasileira.

## Pronúncia

| Número | Pronúncia |
| ------ | --------- |
| 0      | Zero      |
| 1      | Uno       |
| 2      | Dois      |
| 3      | Três      |
| 4      | Quatro    |
| 5      | Cinco     |
| 6      | Meia      |
| 7      | Sete      |
| 8      | Oito      |
| 9      | Nove      |

Exemplos:

FL160

↓

Flight Level Uno Meia Zero

---

276

↓

Dois Sete Meia

---

109.90

↓

Uno Zero Nove Decimal Nove Zero

---

# Pistas

Os designadores de pista deverão utilizar sua nomenclatura operacional.

Exemplos:

09L

↓

Zero Nove Esquerda

---

09R

↓

Zero Nove Direita

---

18C

↓

Um Oito Centro

A leitura literal das letras ("L", "R", "C") não deverá ocorrer.

---

# Alfabeto Fonético ICAO

Todas as letras isoladas deverão utilizar o alfabeto fonético ICAO oficial.

| Letra | Pronúncia |
| ----- | --------- |
| A     | Alpha     |
| B     | Bravo     |
| C     | Charlie   |
| D     | Delta     |
| E     | Echo      |
| F     | Foxtrot   |
| G     | Golf      |
| H     | Hotel     |
| I     | India     |
| J     | Juliett   |
| K     | Kilo      |
| L     | Lima      |
| M     | Mike      |
| N     | November  |
| O     | Oscar     |
| P     | Papa      |
| Q     | Quebec    |
| R     | Romeo     |
| S     | Sierra    |
| T     | Tango     |
| U     | Uniform   |
| V     | Victor    |
| W     | Whiskey   |
| X     | X-ray     |
| Y     | Yankee    |
| Z     | Zulu      |

Exemplos:

PT-XAB

↓

Papa Tango X-ray Alpha Bravo

---

FABX01

↓

Força Aérea Brasileira X-ray Zero Uno

Nenhuma letra deverá ser pronunciada utilizando o alfabeto comum.

---

# Chamadas de aeronaves

Os callsigns deverão utilizar as regras definidas na especificação **Radiotelephony Phraseology**.

A camada de voz apenas converterá o texto para sua pronúncia correta.

---

# Helicópteros

Durante o primeiro contato, aeronaves de asa rotativa deverão identificar-se utilizando a terminologia operacional.

Exemplo:

> Torre Rio, Asa Rotativa PR-ABC...

A palavra "Helicóptero" não deverá ser utilizada como identificação radiotelefônica.

---

# Saudação

As saudações deverão seguir a configuração do idioma e do cenário.

Exemplos:

* Bom dia.
* Boa tarde.
* Boa noite.

A arquitetura deverá permitir desabilitar saudações futuramente.

---

# Abreviações

Termos operacionais deverão possuir pronúncia específica.

Exemplos:

FL

↓

Flight Level

---

DCT

↓

Direct

---

ILS

↓

I L S

ou conforme padrão definido pela fraseologia.

---

# Arquitetura

A geração da fala deverá ser composta por etapas independentes.

1. Geração da mensagem.
2. Normalização da fraseologia.
3. Conversão fonética.
4. Síntese de voz.

Cada etapa deverá ser desacoplada das demais.

---

# Compatibilidade

* Desktop
* Mobile
* Single-player
* Multiplayer

---

# Expansão futura

A arquitetura deverá permitir incorporar:

* fraseologia FAA;
* fraseologia ICAO internacional;
* vozes regionais;
* sotaques;
* diferentes provedores de TTS;
* velocidade de fala configurável;
* variações naturais entre pilotos.

---

# Critérios de aceitação

* Os números utilizam a fraseologia aeronáutica brasileira (Uno, Meia, etc.).
* As pistas utilizam "Esquerda", "Direita" e "Centro".
* Todas as letras utilizam o alfabeto fonético ICAO.
* Callsigns são pronunciados corretamente.
* Aeronaves de asa rotativa identificam-se como "Asa Rotativa".
* A lógica de conversão fonética permanece separada da geração das mensagens.

---

# Implementação

* `engine/radio_phrase.js` — callsigns (inclui dígitos BR: Uno/Meia) e ICAO.
* `engine/voice_phrase.js` (`VoicePhrase.forTts`) — normalização fonética só para TTS
  (pistas, FL, frequências, abreviações, “Helicóptero” → “Asa Rotativa”).
* `js/ui.js` — `speak()` aplica `VoicePhrase.forTts` antes do Web Speech.
