# Feature: Sistema de Emergências 2.0

## Objetivo
Transformar o sistema de emergências em uma das principais mecânicas do jogo, aproximando a experiência da operação real de um controlador de tráfego aéreo sem comprometer a jogabilidade em desktop ou dispositivos móveis.

O foco não é apenas fazer uma aeronave declarar emergência, mas criar um evento operacional completo que impacte todo o aeroporto e obrigue o jogador a reorganizar o tráfego.

---

# Objetivos da implementação

- Tornar as emergências muito mais realistas.
- Aproximar a comunicação da fraseologia ICAO.
- Criar uma arquitetura expansível para novos tipos de emergência.
- Não aumentar excessivamente a complexidade para o jogador.
- Manter compatibilidade com o modo multiplayer.
- Manter compatibilidade com dispositivos móveis.

---

# Conceitos

## Emergência inesperada
O jogador nunca sabe quando ocorrerá uma emergência.

Ela acontece de forma aleatória conforme as regras atuais do jogo (ou futuras configurações de dificuldade).

O jogador não recebe nenhum aviso antecipado.

---

## Fluxo operacional
A emergência não deve ser tratada como um único evento.

Ela possui estados.

Fluxo esperado:

- Operação normal
- Declaração da emergência
- Identificação
- Avaliação
- Coordenação
- Vetoração
- Aproximação
- Pouso
- Pós-pouso
- Encerramento
Cada etapa possui comunicações e decisões próprias.

---

# Comunicação
A comunicação deve se aproximar da operação real.

Exemplo simplificado:

Piloto:

> MAYDAY MAYDAY MAYDAY
ou

> PAN PAN PAN
Controlador:

> Say nature of emergency.
Piloto:

> Engine failure.
Controlador:

> Souls on board?
Piloto responde.

Controlador:

> Fuel remaining?
Piloto responde.

Controlador:

> Say intentions.
Piloto responde.

A comunicação não deve acontecer toda de uma vez.

As informações são obtidas durante a conversa.

---

# Interface
A comunicação continua ocorrendo através do sistema atual de comandos.

Entretanto, durante uma emergência, o jogo poderá oferecer atalhos rápidos para perguntas frequentes, especialmente para dispositivos móveis.

Exemplos:

- Natureza da emergência
- Pessoas a bordo
- Combustível restante
- Intenções
- Pista preferencial
Os atalhos apenas facilitam o input.

A comunicação continua sendo exibida normalmente pelo rádio.

---

# Tipos de emergência
A arquitetura deve permitir adicionar facilmente novos tipos.

Primeira versão:

- Bird strike
- Falha de motor
- Incêndio em motor
- Falha hidráulica
- Falha elétrica
- Problema no trem de pouso
- Falha de flaps
- Despressurização
- Emergência médica
- Pouco combustível
- Fumaça na cabine
- Fumaça no cockpit
- Ameaça de bomba
- Windshear
- Granizo
- Turbulência severa
Não é obrigatório implementar todos nesta etapa.

A arquitetura deve suportá-los.

---

# Gravidade
Cada emergência possui um nível de gravidade.

Exemplos:

- Baixa
- Média
- Alta
- Crítica
A gravidade influencia:

- urgência
- comportamento da aeronave
- evolução da emergência

---

# Evolução
Uma emergência pode:

- permanecer estável;
- piorar;
- melhorar.
A evolução depende:

- tipo da emergência;
- tempo decorrido;
- decisões tomadas;
- fatores específicos de cada situação.
Exemplos:

Bird strike pode evoluir para falha de motor.

Fumaça pode desaparecer.

Pouco combustível pode tornar-se combustível crítico.

---

# Comportamento da aeronave
Cada emergência altera o comportamento do voo.

Exemplos:

Falha de motor:

- subida reduzida;
- razão de subida menor;
- limitações de altitude.
Falha hidráulica:

- curvas mais abertas;
- resposta mais lenta.
Problema no trem:

- preferência por pista maior;
- velocidade diferente.
A arquitetura deve permitir definir comportamentos específicos para cada emergência.

---

# Decisões do piloto
O piloto não é um personagem passivo.

Ele pode:

- solicitar vetores;
- solicitar pista específica;
- informar impossibilidade de cumprir determinada instrução;
- declarar "Unable";
- tomar iniciativas quando necessário.
Essas decisões devem respeitar a natureza da emergência.

---

# Decisões do controlador
O controlador continua sendo responsável pela operação.

Ele decide:

- vetoração;
- pista;
- sequência;
- prioridade;
- organização do tráfego.
Caso uma solicitação do piloto não seja possível, o controlador pode negar ("Unable") e propor alternativa.

---

# Estado Operacional do Aeroporto
Adicionar um estado operacional global.

Estados previstos:

- Normal
- Emergência
- Recuperação
Esse estado poderá ser utilizado futuramente para influenciar diversas mecânicas do jogo.

Nesta primeira versão ele servirá como base arquitetural.

---

# Encerramento da emergência
Resultados possíveis:

- pouso seguro;
- arremetida;
- evacuação;
- encerramento da emergência;
- outros resultados futuros.
A arquitetura deve permitir adicionar novos desfechos posteriormente.

---

# Multiplayer
Toda a lógica deve permanecer compatível com o servidor autoritativo.

Nenhuma decisão importante pode ficar exclusivamente no cliente.

---

# Compatibilidade

- Desktop
- Mobile
- Single-player
- Multiplayer

---

# Critérios de aceitação

- Emergências possuem fluxo completo.
- Comunicação ocorre em etapas.
- Piloto responde dinamicamente.
- Emergências podem evoluir.
- Emergências podem estabilizar.
- Cada tipo pode alterar o comportamento da aeronave.
- Existe Estado Operacional do Aeroporto.
- Arquitetura preparada para novos tipos de emergência.
- Interface continua utilizável em dispositivos móveis.
- Compatibilidade total com multiplayer.

---

# Prompt para implementação
Leia integralmente:

- README.md
- AGENTS.md
- docs/ARQUITETURA-MP.md (caso exista)
- Esta especificação.
Objetivo:

Implementar a primeira fase do Sistema de Emergências 2.0 conforme esta especificação.

Requisitos obrigatórios:

- Não quebrar o modo single-player.
- Não quebrar o multiplayer.
- Manter toda a arquitetura desacoplada.
- Não adicionar conhecimento específico de aeroportos na engine.
- Escrever código limpo e extensível.
- Evitar soluções específicas para apenas um tipo de emergência.
- Projetar a arquitetura pensando em futuras expansões.
Antes de modificar qualquer comportamento existente, identifique os pontos de extensão da engine e proponha uma implementação incremental.

Ao final da implementação, explique:

- arquitetura adotada;
- novos estados criados;
- arquivos modificados;
- decisões tomadas;
- pontos preparados para futuras expansões.

## Ajuste adicional de IA dos pilotos
Durante a implementação, revise também o comportamento geral dos pilotos (inclusive fora das emergências).

Os pilotos não devem agir apenas como executores passivos das instruções do controlador.

Sempre que fizer sentido operacionalmente, eles devem tomar iniciativas compatíveis com a situação do voo, como solicitar vetores, informar impossibilidade de cumprir instruções ("Unable"), solicitar mudanças, antecipar informações relevantes e comunicar alterações de condição da aeronave.

Essas iniciativas devem respeitar a fase do voo, a situação operacional e a fraseologia utilizada pelo jogo, sem retirar do controlador a responsabilidade pela gestão do tráfego.
