# 🛫 ATC Costa Verde

Jogo web de **controle de tráfego aéreo** em HTML/JavaScript puro (sem build, sem dependências).
Você assume o console radar de aproximação + torre: sequencia chegadas pelas STARs, autoriza
aproximações ILS e pousos, libera decolagens e sobe as saídas pelas SIDs até a transferência
ao Centro — mantendo 3 NM / 1.000 ft de separação.

## Como rodar

O jogo carrega os aeroportos via `fetch`, então precisa de um servidor HTTP local:

```bash
python -m http.server 8123
# abra http://localhost:8123
```

## Multiplayer (beta)

Amigos na mesma sessão, cada um numa posição (TWR = torre, APP = aproximação, OBS = observador):

```bash
cd server && npm install && node server/index.js   # ou: cd server && npm start
# abra http://localhost:8124 (o servidor tambem serve o jogo)
```

Na tela inicial, bloco **Multiplayer**: escolha um nick e crie a sessão (você recebe um
código de 5 letras) ou entre com o código de um amigo. No lobby cada um escolhe a posição;
o host inicia. A simulação roda no servidor (tempo real, sem pausa/aceleração).

- Comandos exigem o callsign e respeitam a posição: TWR autoriza pista (ALINHAR/DEC/AP/
  ABORTAR/TAXI/CRZ/ARR), APP faz o resto (altitude, vetores, ILS, HO...). Posição vaga:
  qualquer um cobre.
- Chat pela caixa de comando: `/c mensagem` (sessão) e `/w nick mensagem` (privado).
- Persistência opcional em MongoDB: defina `MONGODB_URI` no ambiente do servidor
  (sem ela, tudo roda em memória).

## Como jogar

Clique numa aeronave (ou strip) e use os botões rápidos, ou digite fraseologia no campo de
comando (callsign completo ou só o final, ex. `3412`):

| Comando | Efeito |
|---|---|
| `A 6000` / `A FL120` | altitude / nível de voo |
| `V 220` / `V LIVRE` | velocidade (≤250 kt abaixo de 10.000 ft) |
| `P 270` · `PE 180` · `PD 360` | proa (PE/PD força o lado da curva) |
| `DIR GOMES` | direto ao fixo (retoma a carta se o fixo pertencer a ela) |
| `VIA` | descer via STAR cumprindo as restrições da carta |
| `ILS 09L` | autoriza aproximação ILS |
| `AP` | autoriza pouso (obrigatório antes de 1 NM final) |
| `ALINHAR 09R` / `DEC 09R` | alinhar e manter / autorizar decolagem |
| `ESPERA NIDOL` | órbita de espera sobre o fixo |
| `ARR` | arremeter / cancelar aproximação |
| `SID CACTO1` / `STAR PEDRA1` | designa/troca o procedimento (reingressa pelo fixo mais próximo) |
| `HO` / `TRANSFERIR` | transfere a saída ao Centro — só perto do fixo de saída e ≥ 9.000 ft |

Vários comandos na mesma linha funcionam: `TAM3412 A 6000 V 220`. Antes da decolagem você pode
dar `A FL150` e `P 120` (cumpridos após decolar). As cartas SID/STAR ficam no botão **📑 Cartas**.
O botão **ATIS** mostra o METAR dinâmico e permite trocar as pistas em uso quando o vento muda.
Sons e voz dos pilotos usam a Web Speech API do navegador (100% local, sem custo).

**Toque (tablet/celular):** pinça = zoom, arrastar = mover, toque = selecionar; com uma aeronave
selecionada, toque num fixo (monta `DIR`) ou numa cabeceira (monta `ILS`/`AP`/`DEC`) e confirme
no botão 📡. O painel de strips abre/fecha pelo botão **📋 Strips**.

## Aeroportos (fases)

Todo o espaço aéreo é orientado a dados: cada aeroporto é um JSON em [`airports/`](airports/),
registrado no manifesto [`airports/index.json`](airports/index.json). O motor não conhece
nenhum aeroporto — só lê essa estrutura, então **adicionar uma fase nova = escrever um JSON**:

```jsonc
{
  "icao": "SBCV", "name": "Costa Verde Intl", "elev": 26, "range": 60,
  "fixes":   { "GOMES": [-13, 0] },              // NM a partir do aeroporto (+x leste, +y norte)
  "runways": { "09L": { "thr": [-0.95, 0.4], "hdg": 90, "len": 1.9, "opp": "27R" } },
  "rwyPair": { "09L": "N", "27R": "N" },          // pistas que compartilham o mesmo asfalto
  "stars":   { "SABIA1": { "cfg": "09", "entry": "SABIA", "name": "...", "route": [
                 { "fix": "GOMES", "alt": 4000, "spd": 200 } ] } },
  "sids":    { "ARENA1": { "cfg": "09", "exit": "ARENA", "name": "...", "route": ["VOLTA"] } },
  "dests":   { "ARENA": ["SBFZ"] },               // destinos ilustrativos por fixo de saída
  "configs": { "09": { "arrRwy": "09L", "depRwy": "09R",
                 "wind": { "dir": 80, "spd": 9 }, "label": "...", "btn": "Fluxo 09" } }
}
```

Roteiro para importar aeroportos reais: transcrever cartas do AISWEB/DECEA (Brasil) para esse
formato, com uma projeção simples lat/lon → NM centrada no aeroporto; depois automatizar com
um parser ARINC 424 (FAA CIFP) para importação em massa.

## Estrutura

```
index.html          interface
css/style.css       tema do console radar
engine/data.js      frota global + carregador de aeroportos (browser e Node)
engine/aircraft.js  física e fases de voo (STAR, vetor, ILS, pouso, decolagem, espera)
engine/commands.js  parser de fraseologia e readbacks
engine/core.js      GameCore: simulação headless (tráfego, conflitos, clima, pontuação)
js/radar.js         renderização do scope (canvas, pan/zoom)
js/ui.js            strips, comunicações, cartas, som e voz
js/main.js          adaptador single-player (liga o GameCore ao DOM)
js/net.js           cliente multiplayer (WebSocket, lobby, hidratação de snapshots)
server/             servidor multiplayer (HTTP + WS, sessões, posições, chat, Mongo opcional)
airports/*.json     fases (espaço aéreo por aeroporto)
```

---
Projeto de estudo/entretenimento — não usar para instrução aeronáutica real.
