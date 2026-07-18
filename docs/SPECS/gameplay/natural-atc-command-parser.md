# Feature: Natural ATC Command Parser

## Objetivo
Evoluir o parser de comandos do controlador para aceitar fraseologia natural, abreviações operacionais e comandos em português e inglês, mantendo total compatibilidade com os comandos existentes.

O objetivo é permitir que o jogador escreva comandos da forma que lhe for mais natural, sem precisar decorar uma sintaxe rígida.

---

# Motivação
Os comandos atuais funcionam muito bem para jogadores experientes, porém representam uma linguagem técnica criada para o jogo.

Embora eficiente, ela não se aproxima da fraseologia utilizada na operação real de controle de tráfego aéreo.

O novo parser deve aproximar a experiência da comunicação operacional sem perder rapidez para quem prefere utilizar comandos curtos.

---

# Princípios
O parser deve ser tolerante.

O jogador não deve ser penalizado por utilizar palavras diferentes que possuam exatamente o mesmo significado operacional.

O foco é interpretar a intenção do controlador, e não validar uma frase específica.

---

# Compatibilidade
Todos os comandos atualmente existentes continuam funcionando exatamente como hoje.

Nenhum comando válido poderá deixar de ser aceito.

O novo parser deverá ser apenas uma expansão das capacidades existentes.

---

# Níveis de interpretação

## Nível 1 — Sintaxe atual
Continuar aceitando integralmente a sintaxe existente.

Exemplos:

- A 5000
- A FL170
- V 220
- P 270
- DCT GOMES
- DIR GOMES (alias de compatibilidade)
- ILS 09L
- AP 09L
- DEC 09R
- VIA

---

## Nível 2 — Abreviações ATC
Aceitar abreviações amplamente utilizadas na aviação.

Exemplos:

- DCT
- HDG
- SPD
- FL
- ALT
- RWY
- TKOF
- APP
- DEP
- ARR
- CLB
- DES
- HOLD
- GA
- TOD
- TOC
A arquitetura deverá permitir adicionar novas abreviações facilmente.

---

## Nível 3 — Linguagem natural
Aceitar comandos escritos de forma semelhante à fraseologia utilizada por controladores.

Exemplos válidos:

- Suba para FL170.
- Desça para 8000 pés.
- Mantenha FL190.
- Mantenha velocidade 220 nós.
- Mantenha proa 270.
- Direto GOMES.
- Prossiga direto GOMES.
- Autorizado ILS pista 09L.
- Autorizado pouso pista 09L.
- Alinhe e aguarde pista 09R.
- Autorizado decolagem pista 09R.
- Após GOMES autorizado descida para FL170.
- Após GOMES autorizado descida para 8000 pés.
- Após 5 milhas direto GOMES.
- Após FL100 mantenha velocidade 250.
Todas essas frases deverão produzir exatamente a mesma instrução interna que os comandos curtos atuais.

---

# Português e inglês
O parser deverá aceitar comandos nos dois idiomas.

Exemplos equivalentes:

- Direto GOMES
- DCT GOMES
- DIR GOMES (compatibilidade)
- Direct GOMES

---

- Suba FL170
- Climb FL170
- Climb to FL170

---

- Desça FL100
- Descend FL100
- Descend to FL100

---

- Mantenha proa 270
- Heading 270
- HDG 270

---

- Mantenha velocidade 220
- Speed 220
- SPD 220

---

- Autorizado pouso
- Cleared to land

---

- Autorizado decolagem
- Cleared for takeoff

---

# Sinônimos
O parser deverá possuir uma tabela de sinônimos.

Exemplos:

Subir

- subir
- suba
- climb
- climb to

---
Descer

- descer
- desça
- descend
- descend to

---
Direto

- direto
- prossiga direto
- voe direto
- direct
- dct
- dir

---
Pouso

- pouso
- pousar
- land
- landing

---
Decolagem

- decolagem
- decolar
- takeoff
- tkof

---

# Palavras opcionais
Algumas palavras não alteram o significado operacional.

O parser deverá ignorá-las durante a interpretação.

Exemplos:

- autorizado
- cleared
- para
- até
- ao
- no
- na
- por favor
- mantenha
- maintain
Exemplo:

As frases abaixo representam exatamente a mesma instrução:

- Após GOMES autorizado descida para FL170.
- Após GOMES desça para FL170.
- Após GOMES FL170.

---

# Condicionais
Toda a sintaxe atual de condicionais deverá continuar funcionando.

Além disso, deverão ser aceitas formas naturais.

Exemplos:

- Após GOMES desça para FL170.
- Após GOMES direto NITUS.
- Após 5 NM proa 180.
- Ao atingir FL120 reduza para 250 nós.
- Deixando 5000 pés direto GOMES.
- Nivelado FL080 mantenha velocidade mínima.

---

# Via SID / STAR
Aceitar diferentes formas de autorizar a navegação publicada.

Exemplos:

- Via.
- Via SID.
- Via STAR.
- Suba via SID.
- Desça via STAR.
- Continue via STAR.
- Cleared via SID.
Todas deverão gerar a mesma representação interna.

---

# Representação interna
Independentemente da frase utilizada pelo controlador, o parser deverá produzir uma representação canônica da instrução.

Exemplo:

As seguintes entradas:

- A FL170
- Suba FL170
- Climb FL170
- Climb to FL170
Devem produzir exatamente o mesmo objeto interno.

O restante da engine nunca deverá depender da frase digitada pelo usuário.

---

# Arquitetura
O parser deverá ser orientado por dicionários de comandos e sinônimos.

Novos comandos, aliases, abreviações e idiomas deverão poder ser adicionados sem necessidade de alterar a lógica principal do parser.

Evitar cadeias extensas de condicionais (`if`/`else`) específicas para cada frase.

---

# Compatibilidade futura
A arquitetura deverá ser preparada para futuras funcionalidades, como:

- reconhecimento de voz;
- IA gerando comandos automaticamente;
- fraseologia ICAO mais completa;
- novos idiomas;
- comandos específicos por tipo de aeronave.

---

# Critérios de aceitação

- Todos os comandos atuais continuam funcionando.
- O parser aceita português e inglês.
- O parser aceita abreviações operacionais.
- O parser aceita linguagem natural.
- Sinônimos produzem exatamente a mesma instrução interna.
- Palavras opcionais não impedem o reconhecimento da intenção.
- O restante da engine trabalha apenas com comandos canônicos.
- A arquitetura permite expansão sem necessidade de reescrever o parser.
- Atualizar o menu de ajuda do jogo.
- atualizar version.md e versão.
