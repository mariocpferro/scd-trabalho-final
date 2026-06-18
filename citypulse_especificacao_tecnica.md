# CityPulse — Especificação Técnica e Plano de Trabalho

**Disciplina:** Software Concorrente e Distribuído — UFG, 2026.1 **Entrega:** 28/06/2026 **Equipe:** 4 integrantes

Este documento descreve o sistema que o grupo vai construir, divide o trabalho entre os 4 integrantes, define os contratos que conectam as partes e explica como integrar tudo e apresentar o trabalho final.

---

## 1\. Visão geral do sistema

O CityPulse é uma plataforma de monitoramento de cidade inteligente. A cidade é dividida em **4 zonas** — Centro, Zona Norte, Zona Sul e Zona Leste — e cada zona tem sensores simulados de três tipos:

- **Temperatura/qualidade do ar** (°C e índice de qualidade do ar)  
- **Vagas de estacionamento disponíveis** (vagas livres / total)  
- **Consumo de energia** (kWh)

Os sensores publicam leituras periodicamente. O sistema processa essas leituras continuamente, mantém o estado atual e o histórico de cada zona, dispara alertas quando algum valor passa de um limite configurado (ex.: qualidade do ar crítica, estacionamento cheio) e expõe tudo isso para clientes através de um dashboard web em tempo real. Por trás, processos em segundo plano cuidam de agregação, limpeza de dados e reconciliação entre réplicas — concorrentemente com os acessos dos sensores e dos operadores.

Os três tipos de usuário/cliente do sistema são:

1. **Sensor simulado** — publica leituras continuamente, não interage com o dashboard.  
2. **Operador** — abre o dashboard, vê o status das zonas em tempo real, recebe alertas, consulta histórico.  
3. **Administrador** — além de tudo que o operador faz, configura os limites que disparam alertas.

## 2\. Como o sistema atende aos requisitos da disciplina

| Requisito do enunciado | Como o CityPulse atende |
| :---- | :---- |
| Serviço acessível a múltiplos clientes na internet | Dashboard web público \+ API REST, acessados por vários operadores simultaneamente |
| Múltiplos componentes distribuídos implementados pelo grupo | Sensores/ingestão, coletores de zona, gateway de API, dashboard e worker de manutenção (5 processos distintos) |
| Acesso concorrente a recursos/dados compartilhados | Vários sensores escrevendo e vários operadores lendo o mesmo estado de zona ao mesmo tempo |
| Processamento no servidor concorrente aos acessos dos clientes | Agregação, sanitização e detecção de alertas rodam continuamente enquanto o servidor atende consultas |
| Interação remota síncrona (bloqueante) e assíncrona | REST e gRPC (síncronos) \+ MQTT, WebSocket e RabbitMQ (assíncronos) |
| Replicação e particionamento de dados e funcionalidades | Cada zona é uma partição; cada partição tem um coletor primário e uma réplica |
| Consistência de dados e disponibilidade de funcionalidades | Escrita de configuração exige confirmação de primário e réplica; failover automático por heartbeat se o primário cair |

O enunciado também pede mais de um paradigma de interação (cliente-servidor, publish-subscribe, messaging) e mais de uma linguagem. O CityPulse usa exatamente:

- **Cliente-servidor:** REST (navegador ↔ gateway) e gRPC (gateway ↔ coletor de zona)  
- **Publish-subscribe:** MQTT (sensores → coletor de zona; coletor → alertas)  
- **Messaging ponto-a-ponto:** RabbitMQ (tarefas de manutenção)  
- **Linguagens:** Java (apenas no Coletor de Zona, pela necessidade de concorrência explícita) e TypeScript em todo o resto (ingestão, gateway em NestJS, dashboard em Next.js, worker de manutenção)

## 3\. Arquitetura geral

flowchart TD

    SENS\[Sensores simulados\<br/\>TypeScript\] \--\>|MQTT pub/sub| MQTT\[(Broker MQTT)\]

    MQTT \--\> COL\[Coletor de Zona\<br/\>Java \- 1 instância por zona\]

    COL \--\>|réplica| COLR\[Réplica do Coletor\]

    COL \<--\>|gRPC| GW\[Gateway de API\<br/\>NestJS\]

    GW \--\>|REST \+ WebSocket| DASH\[Dashboard\<br/\>Next.js\]

    GW \--\>|publica tarefa| RMQ\[(RabbitMQ)\]

    RMQ \--\> WRK\[Worker de manutenção\<br/\>TypeScript\]

    WRK \-.reconciliação/relatórios.-\> COL

    MQTT \-.alertas.-\> GW

Ponto importante: o **Coletor de Zona não é um serviço escrito 4 vezes**. É um único código Java, parametrizado por `zona_id`, que sobe como um processo separado para cada zona (4 processos no total, cada um com sua réplica). É assim que o sistema demonstra particionamento de verdade — cada instância é dona de uma fatia dos dados — sem duplicar código.

## 4\. Contratos compartilhados

Estes contratos precisam estar fechados **antes** de qualquer um começar a implementar — são a única forma de os 4 trabalharem em paralelo sem travar uns aos outros.

### 4.1 Mensagens MQTT (sensores → coletor)

Tópico: `citypulse/sensores/{zona_id}/{tipo}`

{

  "sensor\_id": "sensor-centro-temp-01",

  "zona\_id": "centro",

  "tipo": "temperatura",

  "valor": 26.4,

  "unidade": "celsius",

  "timestamp": "2026-06-17T14:32:10Z"

}

`tipo` é um de: `temperatura`, `qualidade_ar`, `vagas_estacionamento`, `consumo_energia`.

### 4.2 Mensagens MQTT (coletor → alertas)

Tópico: `citypulse/alertas/{zona_id}`

{

  "zona\_id": "centro",

  "tipo": "qualidade\_ar",

  "nivel": "critical",

  "valor": 412,

  "limite": 300,

  "mensagem": "Qualidade do ar crítica na zona Centro",

  "timestamp": "2026-06-17T14:32:11Z"

}

### 4.3 Contrato gRPC (gateway ↔ coletor de zona)

syntax \= "proto3";

package citypulse;

service ZoneCollector {

  rpc GetZoneStatus (ZoneRequest) returns (ZoneStatus);

  rpc GetZoneHistory (HistoryRequest) returns (HistoryResponse);

  rpc SetThreshold (ThresholdRequest) returns (ThresholdAck);

}

message ZoneRequest {

  string zona\_id \= 1;

}

message Metric {

  string tipo \= 1;

  double valor \= 2;

  string unidade \= 3;

  string timestamp \= 4;

}

message ZoneStatus {

  string zona\_id \= 1;

  repeated Metric metricas \= 2;

  string papel\_no\_momento \= 3; // "PRIMARIO" ou "REPLICA"

  string atualizado\_em \= 4;

}

message HistoryRequest {

  string zona\_id \= 1;

  string tipo \= 2;

  string de \= 3;

  string ate \= 4;

}

message DataPoint {

  string timestamp \= 1;

  double valor \= 2;

}

message HistoryResponse {

  repeated DataPoint pontos \= 1;

}

message ThresholdRequest {

  string zona\_id \= 1;

  string tipo \= 2;

  double limite \= 3;

  string nivel \= 4; // "warning" ou "critical"

}

message ThresholdAck {

  bool sucesso \= 1;

  bool confirmado\_primario \= 2;

  bool confirmado\_replica \= 3;

}

`SetThreshold` só deve retornar `sucesso = true` depois que **tanto o primário quanto a réplica** confirmarem a escrita — é o ponto do sistema onde se exige consistência forte.

### 4.4 API REST (gateway ↔ navegador)

| Método | Rota | Descrição |
| :---- | :---- | :---- |
| GET | `/api/zonas` | Lista as zonas e um resumo de status |
| GET | `/api/zonas/:zonaId/status` | Status atual da zona (chama `GetZoneStatus`) |
| GET | `/api/zonas/:zonaId/historico?tipo=&de=&ate=` | Histórico (chama `GetZoneHistory`) |
| GET | `/api/alertas?zona=&nivel=` | Lista alertas recentes |
| POST | `/api/zonas/:zonaId/limites` | Configura limite (chama `SetThreshold`) |

### 4.5 WebSocket (gateway → dashboard)

- Cliente → servidor: `{ "acao": "subscribe", "zona_id": "centro" }`  
- Servidor → cliente: `{ "evento": "alerta", "dados": { ... mesmo formato do tópico de alertas ... } }`  
- Servidor → cliente: `{ "evento": "status_update", "dados": { ... ZoneStatus em JSON ... } }`

### 4.6 Fila RabbitMQ (worker de manutenção)

Fila: `citypulse.manutencao`

{

  "tipo": "reconciliacao",

  "zona\_id": "centro",

  "agendado\_em": "2026-06-17T03:00:00Z"

}

`tipo` é um de: `reconciliacao`, `downsampling`, `relatorio`.

### 4.7 Registro de sensor (ingestão, REST síncrono)

`POST /sensores/registrar` no serviço de ingestão (porta separada da API principal): `{ "sensor_id": "...", "zona_id": "...", "tipo": "..." }`.

---

## 5\. Papéis e responsabilidades

### Integrante 1 — Sensores simulados e ingestão

**Tecnologia:** TypeScript (Node.js)

**O que entregar:**

- Simuladores de sensor: um processo por tipo de sensor por zona (ou um simulador configurável que sobe N instâncias), publicando leituras em MQTT no tópico definido em 4.1, com intervalo configurável (ex.: 5-15s).  
- Serviço de ingestão: um pequeno servidor REST (porta própria) com o endpoint `POST /sensores/registrar` (4.7), usado para registro/poll manual — esta é a parte síncrona deste componente.  
- Geração de valores realistas: temperatura variando suavemente, vagas de estacionamento diminuindo/aumentando, consumo de energia com picos em horários específicos. Incluir ocasionalmente valores fora da faixa normal, para o coletor de zona ter o que sanitizar e para os alertas terem o que disparar.  
- Um script de carga que sobe muitos sensores publicando ao mesmo tempo — usado tanto para testar concorrência quanto para o vídeo de demonstração.

**Critério de aceite:** com um broker MQTT local rodando, os simuladores publicam mensagens válidas no formato 4.1 e é possível confirmar isso assinando o tópico manualmente (ex.: `mosquitto_sub`).

### Integrante 2 — Coletor de Zona

**Tecnologia:** Java

**O que entregar:**

- O serviço Coletor de Zona: consome o(s) tópico(s) MQTT da sua zona (parametrizada via variável de ambiente `ZONA_ID`), mantém o estado atual em memória/estrutura concorrente segura (múltiplas threads de ingestão escrevendo enquanto o servidor gRPC lê).  
- Replicação primário-réplica: a réplica recebe um stream de atualizações do primário. Um mecanismo de heartbeat detecta queda do primário e promove a réplica automaticamente — documentar claramente como esse failover funciona, porque é o ponto mais "distribuído" do trabalho.  
- Processamento em segundo plano, concorrente com a ingestão: agregação periódica (médias por minuto/hora), sanitização de outliers (descartar valores fisicamente impossíveis) e avaliação de limites configurados, publicando no tópico de alertas (4.2) quando necessário.  
- Servidor gRPC implementando o contrato `ZoneCollector` (4.3), incluindo a confirmação de primário+réplica em `SetThreshold`.

**Critério de aceite:** com leituras chegando via MQTT, uma chamada gRPC `GetZoneStatus` retorna os valores agregados corretos; ao matar o processo primário, a réplica assume e uma nova chamada `GetZoneStatus` continua respondendo.

### Integrante 3 — Gateway de API

**Tecnologia:** TypeScript (NestJS)

**O que entregar:**

- Implementação dos endpoints REST descritos em 4.4, cada um traduzindo a chamada para o método gRPC correspondente no Coletor de Zona da zona pedida.  
- Servidor WebSocket (4.5): assina os tópicos de alerta no broker MQTT e repassa para os clientes inscritos por zona; também pode empurrar `status_update` periodicamente.  
- Cliente gRPC para os Coletores de Zona — decidir e documentar a estratégia de leitura (sempre do primário, ou aceitar respostas de réplica para reduzir carga) e deixar essa decisão explícita na documentação de arquitetura.  
- Publicação de tarefas na fila RabbitMQ (4.6) — pode ser feita por aqui ou pelo worker, mas a definição de quem agenda fica com este componente.

**Critério de aceite:** com um Coletor de Zona de mentira (mock) respondendo ao contrato gRPC, todos os endpoints REST e os eventos WebSocket funcionam fim a fim.

### Integrante 4 — Dashboard e worker de manutenção

**Tecnologia:** TypeScript (Next.js para o dashboard; Node.js para o worker)

**O que entregar:**

- Dashboard: visão das 4 zonas com status em tempo real (conectando ao WebSocket), gráfico de histórico (consumindo a rota de histórico), feed de alertas, e uma tela mostrando qual coletor está como primário/réplica em cada zona — essa tela é a prova visual da replicação durante a demonstração.  
- Tela de configuração de limites, chamando `POST /api/zonas/:zonaId/limites`.  
- Worker de manutenção: processo separado que consome a fila `citypulse.manutencao` (4.6) e executa reconciliação entre réplicas, downsampling de dados antigos e geração de relatório periódico.  
- Enquanto o Gateway (Integrante 3\) não está pronto, este time pode trabalhar com um mock da API que segue exatamente o contrato definido em 4.4 e 4.5.

**Critério de aceite:** o dashboard reflete em tempo real uma leitura publicada manualmente via MQTT (passando pela cadeia completa), e o worker processa uma mensagem de teste colocada manualmente na fila.

---

## 6\. Cronograma sugerido

| Período | Atividade |
| :---- | :---- |
| 17–18/06 | Fechar todos os contratos da seção 4, criar o repositório e o esqueleto dos 5 serviços |
| 19–23/06 | Implementação em paralelo, cada um testando localmente contra mocks/contratos |
| 24–25/06 | Integração: subir tudo junto via docker-compose, corrigir divergências de contrato |
| 25–26/06 | Deploy na AWS EC2 |
| 26–27/06 | Gravação do vídeo, escrita da documentação final e geração dos dados de teste |
| 27–28/06 | Revisão e entrega, com folga antes do prazo |

---

## 7\. Como integrar tudo

1. **Estrutura do repositório** (mono-repo): `/sensores-simulados`, `/coletor-zona`, `/gateway-api`, `/dashboard`, `/worker-manutencao`, `/proto` (contrato gRPC compartilhado) e um `docker-compose.yml` na raiz subindo Mosquitto, RabbitMQ e os 5 serviços.  
2. **Ordem de inicialização local:** Mosquitto e RabbitMQ primeiro → 4 instâncias do Coletor de Zona (uma por zona, configuradas via `ZONA_ID`, cada uma com sua réplica) → Gateway de API → Dashboard e Worker → só então os sensores simulados, para começar a gerar tráfego sobre um sistema já no ar.  
3. **Configuração:** cada serviço lê variáveis de ambiente (`.env`) para endereços do broker MQTT, RabbitMQ e dos Coletores de Zona. Usar nomes de serviço do docker-compose como hostname (ex.: `coletor-centro:50051`) evita endereços fixos espalhados pelo código.  
4. **Checklist de teste de integração:**  
   - Publicar uma leitura de teste via MQTT e confirmar que aparece no dashboard em poucos segundos.  
   - Matar o processo primário de uma zona e confirmar que a réplica assume sem o dashboard parar de atualizar.  
   - Rodar o script de carga do Integrante 1 e confirmar que múltiplos sensores e múltiplas abas do dashboard funcionam ao mesmo tempo sem erro.  
   - Configurar um limite via dashboard e confirmar que a resposta só chega depois da confirmação de primário e réplica.  
5. **Deploy na AWS EC2:** uma instância `t3.micro` ou `t3.small` é suficiente para rodar o `docker-compose` completo. Instalar Docker e Docker Compose, copiar o repositório (ou clonar via GitHub), liberar no security group apenas as portas necessárias publicamente (dashboard e API — o MQTT, gRPC e RabbitMQ ficam internos à rede do Docker), e rodar `docker-compose up -d`.

---

## 8\. Como apresentar o trabalho

### Vídeo de demonstração (precisa da participação dos 4 integrantes)

Sugestão de roteiro, com cada integrante apresentando a parte que construiu:

1. **Introdução** (1 pessoa, \~1 min): o problema, a arquitetura geral (pode reaproveitar o diagrama da seção 3).  
2. **Demonstração por componente** (\~1-2 min cada): cada integrante mostra sua parte funcionando isoladamente — sensor publicando, coletor recebendo e respondendo via gRPC, gateway expondo REST/WebSocket, dashboard atualizando.  
3. **Cena central — disponibilidade:** matar ao vivo o processo primário de uma zona e mostrar a réplica assumindo, com o dashboard continuando a atualizar sem interrupção perceptível.  
4. **Cena de concorrência:** dois sensores publicando ao mesmo tempo e dois dashboards conectados recebendo o mesmo alerta simultaneamente.  
5. **Fechamento** (\~1 min): relacionar rapidamente cada característica pedida no enunciado (concorrência, particionamento, replicação, síncrono/assíncrono, consistência/disponibilidade) com o que acabou de ser mostrado — facilita bastante a correção.

### Documentação a entregar

- **Documentação de arquitetura e implementação:** pode reaproveitar as seções 1 a 4 deste documento, com cada integrante detalhando a implementação da sua parte.  
- **Readme de instruções de uso:** como subir o sistema localmente (docker-compose) e como ele está rodando na AWS, com o endereço de acesso ao dashboard.  
- **Dados de teste:** um conjunto de leituras de exemplo e um roteiro de teste reproduzindo o checklist da seção 7\.

Sugestão prática: um dos integrantes assume a consolidação final da documentação (juntar o que cada um escreveu sobre sua parte em um documento único e coerente), para evitar que a entrega final pareça 4 documentos colados.  
