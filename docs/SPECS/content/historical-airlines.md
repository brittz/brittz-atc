# Feature: Historical Airlines

## Objetivo

Adicionar um modo opcional que permita incluir companhias aéreas brasileiras históricas na geração de tráfego do simulador.

Quando habilitado, aeronaves de empresas que já encerraram suas operações poderão aparecer normalmente durante as partidas, aumentando a variedade do tráfego e permitindo cenários inspirados em diferentes períodos da aviação brasileira.

A funcionalidade deverá ser totalmente opcional e não alterar o comportamento padrão do jogo.

---

# Motivação

A aviação comercial brasileira possui uma rica história, marcada por companhias que operaram durante décadas e tiveram papel importante no desenvolvimento do transporte aéreo nacional.

Muitos entusiastas desejam controlar voos de empresas como Varig, VASP e Transbrasil, recriando cenários históricos ou simplesmente aumentando a diversidade do tráfego.

Essa funcionalidade amplia o conteúdo do jogo sem impactar os jogadores que preferem uma experiência contemporânea.

---

# Princípios

A inclusão de companhias históricas deverá ser completamente opcional.

O modo padrão do jogo continuará utilizando apenas operadores atualmente ativos.

As companhias históricas deverão utilizar os mesmos sistemas de navegação, comunicação e IA das demais aeronaves.

---

# Configuração

Adicionar uma opção nas configurações do jogo.

## Nome recomendado

**Companhias Históricas**

Outros nomes possíveis:

* Modo Clássico
* Operadoras Históricas
* Aviação Clássica

O nome **Companhias Históricas** é recomendado por ser objetivo e facilmente compreendido pelos jogadores.

---

# Funcionamento

Quando desabilitado:

* somente companhias atualmente em operação poderão ser geradas.

Quando habilitado:

* companhias atuais e históricas poderão coexistir normalmente durante a geração do tráfego.

No futuro, poderão ser adicionados modos exclusivos para períodos históricos específicos.

---

# Cadastro das companhias

Cada companhia deverá possuir um cadastro próprio contendo, no mínimo:

* nome;
* ICAO;
* IATA;
* callsign radiotelefônico;
* país;
* período de operação;
* ano de fundação;
* ano de encerramento (quando aplicável).

Campos opcionais para futuras expansões:

* pintura (livery);
* logotipo;
* frota utilizada;
* aeroportos principais (hub);
* observações históricas.

---

# Companhias iniciais

A lista inicial deverá contemplar, sempre que possível, as principais empresas brasileiras já extintas.

Exemplos:

* Varig
* VASP
* Transbrasil
* BRA Transportes Aéreos
* Avianca Brasil (Oceanair)
* WebJet
* Pantanal Linhas Aéreas
* Rico Linhas Aéreas
* TAF Linhas Aéreas
* Passaredo (conforme período histórico)
* TRIP Linhas Aéreas
* Nordeste Linhas Aéreas
* Rio Sul
* Cruzeiro do Sul
* Panair do Brasil
* Real Transportes Aéreos
* Sadia Transportes Aéreos
* Noar Linhas Aéreas
* Puma Air

A lista poderá ser ampliada futuramente sem necessidade de alterações na arquitetura.

---

# Callsigns

Cada companhia deverá utilizar seu callsign oficial durante as comunicações.

Exemplos:

VARIG

↓

Varig

VASP

↓

VASP

Transbrasil

↓

Transbrasil

A funcionalidade deverá reutilizar o sistema definido na especificação **Radiotelephony Phraseology**.

---

# Geração de tráfego

As companhias históricas deverão participar normalmente da geração de voos.

A distribuição poderá utilizar os mesmos critérios empregados para companhias atuais.

A arquitetura deverá permitir futuras configurações de frequência por companhia.

---

# Compatibilidade temporal

Cada companhia deverá possuir seu período histórico de operação registrado.

Essas informações não restringirão automaticamente a geração de voos nesta primeira versão, mas deverão estar disponíveis para futuras funcionalidades.

Exemplos de uso futuro:

* cenários por década;
* aeroportos históricos;
* eventos especiais;
* campanhas.

---

# Interface

Adicionar uma opção nas configurações:

☐ Companhias Históricas

Ao ativar essa opção, uma breve descrição poderá ser exibida:

> Inclui companhias aéreas brasileiras que já encerraram suas operações na geração de tráfego.

Nenhuma outra configuração será necessária.

---

# Arquitetura

As companhias deverão ser tratadas como registros de dados.

A engine não deverá possuir regras específicas para empresas históricas.

Todas as informações deverão ser carregadas a partir da base de operadores.

Novas companhias poderão ser adicionadas apenas através da inclusão de novos registros.

---

# Compatibilidade

* Desktop
* Mobile
* Single-player
* Multiplayer

---

# Expansão futura

A arquitetura deverá permitir incorporar:

* cenários por década (1960, 1970, 1980, 1990, 2000...);
* filtros por período histórico;
* liveries históricas;
* frotas compatíveis com cada época;
* aeroportos e procedimentos históricos;
* companhias internacionais históricas;
* eventos temáticos da aviação brasileira.

## Persistência de Dados

As companhias aéreas não deverão ser cadastradas diretamente no código da aplicação.

A implementação deverá utilizar uma camada de dados independente da engine, permitindo que a origem dessas informações seja substituída futuramente sem impacto na lógica do jogo.

Na implementação inicial, recomenda-se armazenar as companhias em um arquivo JSON ou outro formato equivalente de dados estruturados.

Exemplo de informações armazenadas:

* nome;
* ICAO;
* IATA;
* callsign;
* país;
* período de operação;
* status (ativa, encerrada, incorporada);
* demais metadados necessários.

A engine nunca deverá acessar esse arquivo diretamente. Todo acesso deverá ocorrer através de um serviço (por exemplo, `AirlineService`), responsável por fornecer os dados das companhias.

Essa abstração permitirá que, futuramente, a origem dos dados seja alterada sem necessidade de modificar a lógica do jogo.

Exemplos de possíveis fontes de dados:

* arquivo JSON local;
* API REST;
* MongoDB;
* SQLite;
* IndexedDB;
* qualquer outro repositório de dados.

O restante da aplicação deverá consumir apenas a interface exposta pelo serviço, permanecendo totalmente desacoplado da forma como os dados são armazenados.

Essa arquitetura também facilitará futuras funcionalidades como atualização online da base de companhias, sincronização com servidores, criação de mods, editor de conteúdo e suporte a cenários históricos personalizados.

---

# Critérios de aceitação

* O jogo possui uma opção para habilitar ou desabilitar companhias históricas.
* Quando desabilitada, apenas companhias atuais são geradas.
* Quando habilitada, companhias históricas passam a integrar a geração de tráfego.
* Cada companhia possui, no mínimo, nome, ICAO, IATA, callsign e período de operação cadastrados.
* Os callsigns utilizam a infraestrutura definida na especificação **Radiotelephony Phraseology**.
* A arquitetura permite adicionar novas companhias sem alterações no código da engine.
