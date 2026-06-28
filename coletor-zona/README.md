# Coletor de Zona (Integrante 2)

Serviço em **Java 21** que é dono de uma fatia (zona) do CityPulse. Um único binário,
parametrizado por `ZONA_ID`, sobe como **primário** ou **réplica**. Para cada uma das 4 zonas
(centro, norte, sul, leste) roda um par primário + réplica.

É o componente mais "distribuído" do trabalho: concentra **concorrência**, **particionamento**,
**replicação com failover**, **interação síncrona (gRPC) + assíncrona (MQTT)** e **consistência forte**.

### Onde ele se encaixa
O CityPulse é uma plataforma de monitoramento de cidade inteligente dividida em 4 zonas. O fluxo é:

```
Sensores (Integrante 1) ──MQTT──► COLETOR DE ZONA (este) ──gRPC──► Gateway (Integrante 3) ──REST/WebSocket──► Dashboard (Integrante 4)
```

Os **sensores** publicam leituras via MQTT; **este coletor** processa, guarda o estado/histórico e
dispara alertas; o **gateway** lê este coletor por gRPC e expõe REST/WebSocket para o **dashboard**.
A visão completa do sistema e os contratos entre as partes estão em
[`../citypulse_especificacao_tecnica.md`](../citypulse_especificacao_tecnica.md) — vale a leitura
para quem está chegando agora.

## O que ele faz

1. **Ingestão MQTT** — assina `citypulse/sensores/{ZONA_ID}/+` e processa as leituras dos sensores.
2. **Estado concorrente** — mantém o valor atual e o histórico de cada tipo em estruturas
   thread-safe, escritas por várias threads de ingestão enquanto o gRPC lê.
3. **Sanitização** — descarta valores fisicamente impossíveis (outliers) antes de armazenar.
4. **Processamento em segundo plano** — agregação periódica (médias por minuto) e avaliação de
   limites, publicando alertas em `citypulse/alertas/{ZONA_ID}` (contrato 4.2).
5. **Servidor gRPC `ZoneCollector`** (contrato 4.3) — `GetZoneStatus`, `GetZoneHistory`,
   `SetThreshold`.
6. **Replicação primário→réplica com failover** — o primário faz stream do estado para a réplica;
   se o primário cair, a réplica se promove automaticamente (heartbeat).

## Arquitetura interna

```
              citypulse/sensores/{zona}/+ (MQTT)
                          │
                  ┌───────▼────────┐
   threads de     │  IngestaoMqtt  │  (pool de 4 threads)
   ingestão  ───► │  + Sanitizador │
                  └───────┬────────┘
                          │ registrarLeitura()
                  ┌───────▼────────┐      leitura          ┌──────────────────┐
                  │   EstadoZona   │◄─── concorrente ─────►│ ZoneCollector gRPC│◄── Gateway (Integrante 3)
                  │ (Concurrent*)  │      (gRPC lê)        └──────────────────┘
                  └───┬────────┬───┘
        AvaliadorLim. │        │ Agregador (médias/min, em 2º plano)
   alerta MQTT ◄──────┘        │
                          (se PRIMARIO) replica via stream gRPC interno
                          ┌────▼─────────────────────────┐
                          │ ClienteReplicacao (primário)  │──stream + heartbeat──►┐
                          └───────────────────────────────┘                       │
                          ┌──────────────────────────────────────────────────────▼─┐
                          │ ServidorReplicacao (réplica) — aplica estado + watchdog  │
                          │ sem heartbeat por 6s ⇒ GerenciadorPapel.promover()       │
                          └──────────────────────────────────────────────────────────┘
```

### Concorrência (onde está)
- **`EstadoZona`** usa `ConcurrentHashMap` (valor atual e limites) e `ConcurrentLinkedDeque`
  (histórico por tipo). Escrito pelas threads de ingestão e pela thread de replicação; lido pelo
  gRPC e pelo agregador — tudo sem `synchronized` no caminho quente.
- **`IngestaoMqtt`** despacha cada mensagem para um `ExecutorService` de 4 threads, então várias
  leituras são processadas em paralelo (e os nomes de thread `ingestao-*` aparecem no log).
- **`Agregador`** roda num `ScheduledExecutorService` próprio, concorrente com a ingestão.
- **`GerenciadorPapel`** guarda o papel num `AtomicReference`; a promoção é um `compareAndSet`.

### Replicação e failover (o ponto mais avaliado)
- O **primário** abre um stream gRPC `ReplicarEstado` para a **réplica** (`REPLICA_ADDR`) e envia
  cada leitura nova mais um **heartbeat a cada 2 s**. Reconecta sozinho se a réplica subir depois
  ou o stream cair.
- A **réplica** aplica as atualizações no seu próprio `EstadoZona` e roda um **watchdog**: se ficar
  **6 s sem heartbeat** (ou o stream cair com erro), `GerenciadorPapel.promover()` a torna
  `PRIMARIO`. A partir daí ela passa a processar o MQTT diretamente (já estava inscrita no tópico).
- Contrato interno: [`src/main/proto/replicacao.proto`](src/main/proto/replicacao.proto) — separado
  do contrato compartilhado, só os coletores falam entre si.

### Consistência forte no `SetThreshold`
`SetThreshold` aplica o limite no primário **e** chama, de forma síncrona, `AplicarLimite` na
réplica. Só retorna `sucesso = true` quando os dois confirmam — `ThresholdAck.confirmado_primario`
e `confirmado_replica` ambos `true`.

### Limitação conhecida (escopo do trabalho)
Não há demote automático nem re-join do primário antigo após um failover (cenário de split-brain
está fora do escopo). Depois de promovida, a réplica opera como primário sem uma nova réplica.

## Variáveis de ambiente

| Variável | Default | Descrição |
| :-- | :-- | :-- |
| `ZONA_ID` | — (obrigatória) | `centro` \| `norte` \| `sul` \| `leste` |
| `PAPEL_INICIAL` | `PRIMARIO` | `PRIMARIO` \| `REPLICA` |
| `GRPC_PORT` | `50051` | porta do serviço `ZoneCollector` |
| `MQTT_BROKER_URL` | `tcp://localhost:1883` | broker MQTT |
| `REPLICA_ADDR` | — | `host:porta` da réplica (só no primário) |
| `REPLICACAO_PORT` | `60051` | porta do serviço interno (só na réplica) |

## Pré-requisitos
- **Docker** e **Docker Compose v2** instalados, com o daemon rodando — confira com `docker info`
  (se der erro de permissão/conexão, inicie o serviço, ex.: `sudo systemctl start docker`).
- O repositório clonado. **Rode todos os comandos a partir da raiz do repositório** (a pasta que
  contém o `docker-compose.yml`), e não de dentro de `coletor-zona/`.
- Acesso à internet na **primeira** execução (baixa as imagens base e a imagem do `grpcurl`).
- Você **não** precisa instalar Java, Maven, mosquitto-clients nem grpcurl: tudo roda em containers.

## Como rodar

### Via docker-compose (recomendado)
A partir da raiz do repositório.

Só este componente (1 zona, suficiente para os testes abaixo):
```bash
docker compose up -d --build mosquitto coletor-centro coletor-centro-replica
```

Só os 4 pares de coletores (todas as zonas):
```bash
docker compose up -d --build mosquitto \
  coletor-centro coletor-centro-replica \
  coletor-norte  coletor-norte-replica \
  coletor-sul    coletor-sul-replica \
  coletor-leste  coletor-leste-replica
```

O sistema inteiro (infra + coletores + gateway + sensores):
```bash
docker compose up -d --build
```

Portas gRPC publicadas no host: primários `50051-50054`, réplicas `50055-50058`.
Acompanhe os logs de uma instância com `docker logs -f citypulse-coletor-centro`.

### Build local (sem Docker)
Precisa de Maven (o `protobuf-maven-plugin` baixa o `protoc` sozinho):
```bash
cd coletor-zona
mvn clean package -DskipTests
# primário:
ZONA_ID=centro PAPEL_INICIAL=PRIMARIO GRPC_PORT=50051 \
  REPLICA_ADDR=localhost:60051 MQTT_BROKER_URL=tcp://localhost:1883 \
  java -jar target/coletor-zona-1.0.0.jar
# réplica (outro terminal, GRPC_PORT diferente fora do Docker):
ZONA_ID=centro PAPEL_INICIAL=REPLICA GRPC_PORT=50061 REPLICACAO_PORT=60051 \
  MQTT_BROKER_URL=tcp://localhost:1883 \
  java -jar target/coletor-zona-1.0.0.jar
```

## Roteiro de teste (critérios de aceite)

Os comandos abaixo **não exigem instalar nada** além do Docker: o `mosquitto_pub`/`mosquitto_sub`
roda dentro do container do broker e o `grpcurl` roda a partir de uma imagem pronta na mesma rede.

**1. Suba o par `centro`** (ver "Como rodar") **e confirme que está no ar:**
```bash
docker compose ps          # coletor-centro e coletor-centro-replica devem aparecer como "Up"
docker logs citypulse-coletor-centro | grep "ZoneCollector gRPC ouvindo"   # deve achar a linha
```

**2. Descubra o nome da rede do compose** (depende do nome da pasta do repositório; o comando
abaixo detecta sozinho) — todos os testes usam a variável `$NET`:
```bash
NET=$(docker network ls --format '{{.Name}}' | grep citypulse)
echo "$NET"   # ex.: scd-trabalho-final_citypulse
```

**3. Rode os testes** (cole um bloco por vez para ler a saída de cada um):

```bash
# 1) Ingestão: publica uma leitura e confere no status
docker exec citypulse-mosquitto mosquitto_pub -t citypulse/sensores/centro/temperatura \
  -m '{"sensor_id":"t","zona_id":"centro","tipo":"temperatura","valor":26.4,"unidade":"celsius","timestamp":"2026-06-27T12:00:00Z"}'

docker run --rm --network $NET -v "$PWD/proto:/proto:ro" fullstorydev/grpcurl:latest \
  -plaintext -import-path /proto -proto citypulse.proto \
  -d '{"zona_id":"centro"}' coletor-centro:50051 citypulse.ZoneCollector/GetZoneStatus
# → lista a métrica temperatura (26.4) e papelNoMomento "PRIMARIO"

# 2) Sanitização: outlier não entra no estado
docker exec citypulse-mosquitto mosquitto_pub -t citypulse/sensores/centro/temperatura \
  -m '{"sensor_id":"t","zona_id":"centro","tipo":"temperatura","valor":999,"unidade":"celsius","timestamp":"2026-06-27T12:05:00Z"}'
# repita o GetZoneStatus do teste 1): temperatura continua 26.4 (999 descartado)
docker logs citypulse-coletor-centro 2>&1 | grep "descartada"   # log "leitura descartada (outlier)"

# 3) Consistência forte do SetThreshold (confirma primário + réplica)
docker run --rm --network $NET -v "$PWD/proto:/proto:ro" fullstorydev/grpcurl:latest \
  -plaintext -import-path /proto -proto citypulse.proto \
  -d '{"zona_id":"centro","tipo":"temperatura","limite":20,"nivel":"warning"}' \
  coletor-centro:50051 citypulse.ZoneCollector/SetThreshold
# → { "sucesso": true, "confirmadoPrimario": true, "confirmadoReplica": true }

# 4) Alerta: assina o tópico e publica uma leitura acima do limite
docker exec -d citypulse-mosquitto sh -c "timeout 10 mosquitto_sub -t citypulse/alertas/centro -C 1 > /tmp/alerta.txt"
sleep 1
docker exec citypulse-mosquitto mosquitto_pub -t citypulse/sensores/centro/temperatura \
  -m '{"sensor_id":"t","zona_id":"centro","tipo":"temperatura","valor":33,"unidade":"celsius","timestamp":"2026-06-27T12:10:00Z"}'
sleep 2
docker exec citypulse-mosquitto cat /tmp/alerta.txt   # alerta no formato do contrato 4.2

# 5) Failover: mata o primário e confere a réplica assumindo
docker kill citypulse-coletor-centro
sleep 3
docker run --rm --network $NET -v "$PWD/proto:/proto:ro" fullstorydev/grpcurl:latest \
  -plaintext -import-path /proto -proto citypulse.proto \
  -d '{"zona_id":"centro"}' coletor-centro-replica:50051 citypulse.ZoneCollector/GetZoneStatus
# → continua respondendo, agora com papelNoMomento "PRIMARIO"
#   (e mantém o último valor replicado — prova de que o stream chegou na réplica)
docker logs citypulse-coletor-centro-replica 2>&1 | grep FAILOVER
```

> Se preferir usar ferramentas no host (`mosquitto_pub`/`mosquitto_sub` do pacote
> `mosquitto-clients` e `grpcurl`), troque `coletor-centro:50051` por `localhost:50051`
> (réplica em `localhost:50055`) e use os binários direto, sem o `docker run`/`docker exec`.

Ao terminar: `docker compose down`.

## Sincronia do contrato gRPC
`src/main/proto/citypulse.proto` é uma **cópia** de `/proto/citypulse.proto` (mesmo padrão do
`gateway-api`). Se o contrato compartilhado mudar, atualize as duas cópias.
