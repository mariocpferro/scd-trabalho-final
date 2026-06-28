# CityPulse — Guia de Deploy na AWS

## Por que múltiplas instâncias EC2?

Rodar tudo em uma única máquina com docker-compose seria um sistema distribuído **simulado** — os serviços estão na mesma CPU, na mesma memória, na mesma rede. O enunciado exige que os componentes sejam **de fato distribuídos**, e a disciplina de Software Concorrente e Distribuído cobra isso: quando o coletor primário "cai" durante a apresentação, ele precisa ser um processo em outra máquina física caindo de verdade.

Com 5 instâncias EC2 diferentes:
- Cada componente está numa máquina separada, se comunicando pela rede (como sistemas reais).
- O failover da Instância B para a Instância C é um evento de rede genuíno.
- Múltiplos operadores acessando o dashboard de lugares diferentes passam de fato pela internet.

---

## Distribuição dos serviços

| Instância | Serviços | Tipo | Acesso |
|---|---|---|---|
| **A — Broker** | Mosquitto (MQTT) + RabbitMQ | t3.micro | Interno |
| **B — Primário** | 4× Coletor de Zona Java (primário) | t3.small | Interno |
| **C — Réplica** | 4× Coletor de Zona Java (réplica) | t3.micro | Interno |
| **D — Gateway** | NestJS (REST + WebSocket) + Worker | t3.micro | Público (porta 3000) |
| **E — Dashboard** | Next.js (dashboard) + Sensores simulados (script de carga) | t3.micro | Público (porta 3002) |

> **Custo estimado:** 3-4 dias rodando = ~$3-5 no total. Instâncias t3.micro são elegíveis ao free tier AWS (750h/mês). Se o grupo tiver créditos AWS Academy ou AWS Educate, o custo é zero.

---

## Passo 1 — Criar o par de chaves (uma vez, compartilhar com o grupo)

No console AWS → **EC2** → **Key Pairs** → **Create key pair**:
- Nome: `citypulse-key`
- Formato: `.pem` (Linux/Mac) ou `.ppk` (Windows com PuTTY)
- Salvar o arquivo e compartilhar com os 4 integrantes via canal seguro.
- No Linux/Mac, proteger o arquivo: `chmod 400 citypulse-key.pem`

---

## Passo 2 — Criar o Security Group

No console AWS → **EC2** → **Security Groups** → **Create security group**:

- **Nome:** `citypulse-sg`
- **VPC:** VPC padrão (default)

**Regras de entrada (Inbound rules):**

| Tipo | Protocolo | Porta | Origem | Motivo |
|---|---|---|---|---|
| SSH | TCP | 22 | `0.0.0.0/0` | Acesso SSH do grupo |
| Custom TCP | TCP | 3000 | `0.0.0.0/0` | API REST + WebSocket (Gateway) |
| Custom TCP | TCP | 3002 | `0.0.0.0/0` | Dashboard público |
| All traffic | All | All | `citypulse-sg` | Instâncias do grupo conversam entre si livremente |

A última regra (self-referencing) é a mais importante: ela permite que o Gateway chame o Coletor de Zona via gRPC, que o Broker receba conexões MQTT e AMQP de outras instâncias, e que a replicação funcione — tudo sem precisar abrir porta por porta para o mundo externo.

**Regras de saída (Outbound):** manter o padrão (All traffic liberado).

---

## Passo 3 — Lançar as 5 instâncias EC2

Repetir o processo abaixo **5 vezes**, trocando o nome a cada vez. No console AWS → **EC2** → **Launch instance**:

- **AMI:** Amazon Linux 2023 (gratuito)
- **Tipo:** `t3.small` para a Instância B; `t3.micro` para todas as outras
- **Key pair:** `citypulse-key`
- **Security group:** `citypulse-sg`
- **Storage:** padrão (8 GB gp3)

Nomes:
1. `citypulse-broker`
2. `citypulse-primario`
3. `citypulse-replica`
4. `citypulse-gateway`
5. `citypulse-dashboard`

---

## Passo 4 — Anotar os IPs privados

Após as 5 instâncias estarem em estado `Running`, anotar os **IPs privados** de cada uma. No console AWS, clicar em cada instância e copiar o campo **Private IPv4 address**.

Montar uma tabela como esta (os valores abaixo são exemplos — os seus serão diferentes):

| Instância | IP privado (exemplo) |
|---|---|
| A — Broker | `10.0.1.10` |
| B — Primário | `10.0.1.20` |
| C — Réplica | `10.0.1.30` |
| D — Gateway | `10.0.1.40` |
| E — Dashboard | `10.0.1.50` |

**Por que IP privado e não IP público?** IPs públicos mudam se a instância for reiniciada (a não ser que se contrate um Elastic IP). IPs privados são estáveis dentro da VPC e a comunicação interna não consome banda paga.

---

## Passo 5 — Instalar Docker em todas as instâncias

Repetir em cada uma das 5 instâncias via SSH:

```bash
# Conectar via SSH (substituir pelo IP público da instância)
ssh -i citypulse-key.pem ec2-user@<IP_PUBLICO_DA_INSTANCIA>

# Instalar Docker
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Sair e reconectar para o grupo docker ter efeito
exit
```

Reconectar via SSH e verificar:

```bash
docker --version
docker-compose --version
```

---

## Passo 6 — Deploy da Instância A (Broker)

Conectar na Instância A e criar a estrutura:

```bash
mkdir -p ~/citypulse-broker && cd ~/citypulse-broker
```

Criar o arquivo `mosquitto.conf`:

```conf
listener 1883 0.0.0.0
allow_anonymous true
persistence true
persistence_location /mosquitto/data/
log_dest stdout
```

Criar o `docker-compose.yml`:

```yaml
version: '3.8'

services:
  mosquitto:
    image: eclipse-mosquitto:2
    container_name: mqtt-broker
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf
      - mosquitto-data:/mosquitto/data
    restart: unless-stopped

  rabbitmq:
    image: rabbitmq:3-management
    container_name: rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      - RABBITMQ_DEFAULT_USER=citypulse
      - RABBITMQ_DEFAULT_PASS=citypulse
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    restart: unless-stopped

volumes:
  mosquitto-data:
  rabbitmq-data:
```

Subir:

```bash
docker-compose up -d
```

Verificar:

```bash
docker-compose logs -f
# Deve mostrar mosquitto e rabbitmq iniciados sem erro
```

---

## Passo 7 — Deploy da Instância B (Coletores Primários)

Conectar na Instância B. O código do coletor-zona (Java) deve estar disponível. Há duas formas:

**Opção 1 (recomendada): clonar o repositório**
```bash
git clone https://github.com/<org>/citypulse.git
cd citypulse/coletor-zona
```

**Opção 2: copiar os arquivos via SCP**
```bash
# Rodar no computador local
scp -i citypulse-key.pem -r ./coletor-zona ec2-user@<IP_PUBLICO_B>:~/
```

Criar o arquivo `.env` dentro de `coletor-zona/` (substituindo pelos **IPs privados** reais da
Instância A e da Instância C):

```env
# IP privado da Instância A (broker) e da Instância C (réplicas)
BROKER_IP=<IP_PRIVADO_A>
REPLICA_IP=<IP_PRIVADO_C>
```

Criar o `docker-compose.yml` (também dentro de `coletor-zona/`). Cada zona usa sua própria porta
gRPC (50051–50054, que o gateway espera) e aponta `REPLICA_ADDR` para a porta de replicação da sua
réplica na Instância C (60051–60054):

```yaml
services:
  coletor-centro:
    build: .
    container_name: coletor-centro
    ports: ["50051:50051"]
    environment:
      ZONA_ID: centro
      PAPEL_INICIAL: PRIMARIO
      GRPC_PORT: 50051
      MQTT_BROKER_URL: tcp://${BROKER_IP}:1883
      REPLICA_ADDR: ${REPLICA_IP}:60051
    restart: unless-stopped

  coletor-norte:
    build: .
    container_name: coletor-norte
    ports: ["50052:50052"]
    environment:
      ZONA_ID: norte
      PAPEL_INICIAL: PRIMARIO
      GRPC_PORT: 50052
      MQTT_BROKER_URL: tcp://${BROKER_IP}:1883
      REPLICA_ADDR: ${REPLICA_IP}:60052
    restart: unless-stopped

  coletor-sul:
    build: .
    container_name: coletor-sul
    ports: ["50053:50053"]
    environment:
      ZONA_ID: sul
      PAPEL_INICIAL: PRIMARIO
      GRPC_PORT: 50053
      MQTT_BROKER_URL: tcp://${BROKER_IP}:1883
      REPLICA_ADDR: ${REPLICA_IP}:60053
    restart: unless-stopped

  coletor-leste:
    build: .
    container_name: coletor-leste
    ports: ["50054:50054"]
    environment:
      ZONA_ID: leste
      PAPEL_INICIAL: PRIMARIO
      GRPC_PORT: 50054
      MQTT_BROKER_URL: tcp://${BROKER_IP}:1883
      REPLICA_ADDR: ${REPLICA_IP}:60054
    restart: unless-stopped
```

Subir (o build da imagem Java pode demorar alguns minutos):

```bash
docker-compose up -d --build
```

Verificar que subiu e que alcançou a réplica (Instância C):

```bash
docker-compose ps                                               # 4 coletores "Up"
docker logs coletor-centro | grep "ZoneCollector gRPC ouvindo"  # gRPC no ar
docker logs coletor-centro | grep "stream de replicação aberto" # conseguiu falar com a réplica C
```

> A linha **"stream de replicação aberto"** confirma que o primário alcançou a réplica na porta
> 60051. Se a Instância C ainda não subiu, o log mostra tentativas de reconexão — é normal, ele
> tenta sozinho até C estar no ar.

---

## Passo 8 — Deploy da Instância C (Coletores Réplica)

A Instância C roda as 4 réplicas. Clonar o repositório e entrar em `coletor-zona/` (igual ao Passo 7).
Ela só precisa saber onde está o broker (Instância A):

```env
# IP privado da Instância A (broker)
BROKER_IP=<IP_PRIVADO_A>
```

O `docker-compose.yml` da réplica é **diferente** do primário: cada réplica sobe como
`PAPEL_INICIAL=REPLICA`, hospeda o serviço interno de replicação em `REPLICACAO_PORT` (que o
primário acessa) e publica **duas** portas — a gRPC (5005x, para o gateway alcançá-la no failover)
e a de replicação (6005x, para o primário enviar o stream de estado):

```yaml
services:
  coletor-centro-replica:
    build: .
    container_name: coletor-centro-replica
    ports: ["50051:50051", "60051:60051"]
    environment:
      ZONA_ID: centro
      PAPEL_INICIAL: REPLICA
      GRPC_PORT: 50051
      REPLICACAO_PORT: 60051
      MQTT_BROKER_URL: tcp://${BROKER_IP}:1883
    restart: unless-stopped

  coletor-norte-replica:
    build: .
    container_name: coletor-norte-replica
    ports: ["50052:50052", "60052:60052"]
    environment:
      ZONA_ID: norte
      PAPEL_INICIAL: REPLICA
      GRPC_PORT: 50052
      REPLICACAO_PORT: 60052
      MQTT_BROKER_URL: tcp://${BROKER_IP}:1883
    restart: unless-stopped

  coletor-sul-replica:
    build: .
    container_name: coletor-sul-replica
    ports: ["50053:50053", "60053:60053"]
    environment:
      ZONA_ID: sul
      PAPEL_INICIAL: REPLICA
      GRPC_PORT: 50053
      REPLICACAO_PORT: 60053
      MQTT_BROKER_URL: tcp://${BROKER_IP}:1883
    restart: unless-stopped

  coletor-leste-replica:
    build: .
    container_name: coletor-leste-replica
    ports: ["50054:50054", "60054:60054"]
    environment:
      ZONA_ID: leste
      PAPEL_INICIAL: REPLICA
      GRPC_PORT: 50054
      REPLICACAO_PORT: 60054
      MQTT_BROKER_URL: tcp://${BROKER_IP}:1883
    restart: unless-stopped
```

Subir:

```bash
docker-compose up -d --build
```

> Observação: as portas de replicação 60051–60054 e as gRPC 50051–50054 só são acessadas por outras
> instâncias do grupo (B e D), o que já é permitido pela regra self-referencing do `citypulse-sg` —
> não precisam ser abertas para a internet.

---

## Passo 9 — Deploy da Instância D (Gateway + Worker)

Clonar o repositório e criar o `.env` **na raiz** do repositório (onde ficam as pastas
`gateway-api/` e `worker-manutencao/`). Usar **IP privado** de A/B/C:

```env
# API
PORT=3000

# Broker (Instância A) — note os esquemas mqtt:// e amqp://
MQTT_BROKER_URL=mqtt://<IP_PRIVADO_A>:1883
RABBITMQ_URL=amqp://citypulse:citypulse@<IP_PRIVADO_A>:5672

# Coletores primários (Instância B)
COLETOR_CENTRO_ADDR=<IP_PRIVADO_B>:50051
COLETOR_NORTE_ADDR=<IP_PRIVADO_B>:50052
COLETOR_SUL_ADDR=<IP_PRIVADO_B>:50053
COLETOR_LESTE_ADDR=<IP_PRIVADO_B>:50054

# Coletores réplica (Instância C) — usados no failover
COLETOR_CENTRO_REPLICA_ADDR=<IP_PRIVADO_C>:50051
COLETOR_NORTE_REPLICA_ADDR=<IP_PRIVADO_C>:50052
COLETOR_SUL_REPLICA_ADDR=<IP_PRIVADO_C>:50053
COLETOR_LESTE_REPLICA_ADDR=<IP_PRIVADO_C>:50054
```

> O gateway já libera CORS para qualquer origem (`*`), então não há `CORS_ORIGIN` a configurar.

Criar o `docker-compose.yml` na raiz do repositório:

```yaml
services:
  gateway:
    build: ./gateway-api
    container_name: gateway
    ports:
      - "3000:3000"
    env_file: .env
    restart: unless-stopped

  worker:
    build: ./worker-manutencao
    container_name: worker
    env_file: .env
    restart: unless-stopped
```

Subir:

```bash
docker-compose up -d --build
```

Verificar (a API deve listar as 4 zonas, consultando os coletores na Instância B):

```bash
curl http://localhost:3000/api/zonas
```

---

## Passo 10 — Deploy da Instância E (Dashboard + Sensores)

Clonar o repositório e criar o `.env` na raiz. O dashboard fala com o gateway pelo **IP público**
da Instância D (o navegador do operador é quem acessa); os sensores falam com o broker pelo
**IP privado** da Instância A:

```env
# IP PÚBLICO da Instância D (gateway) — embutido no bundle do Next.js em build-time
NEXT_PUBLIC_GATEWAY_URL=http://<IP_PUBLICO_D>:3000

# IP privado da Instância A (broker) — usado pelos sensores simulados
BROKER_IP=<IP_PRIVADO_A>
```

> **Atenção:** `NEXT_PUBLIC_GATEWAY_URL` é resolvida em **build-time**. Se o IP do gateway mudar,
> é preciso rodar `docker-compose up -d --build` de novo.

Criar o `docker-compose.yml` na raiz. O serviço de sensores usa o **script de carga**
(`load-test.ts`), que sobe 64 sensores cobrindo as 4 zonas e os 4 tipos num único processo — assim
uma instância só gera tráfego para todo o sistema:

```yaml
services:
  dashboard:
    build:
      context: ./dashboard
      args:
        NEXT_PUBLIC_GATEWAY_URL: ${NEXT_PUBLIC_GATEWAY_URL}
    container_name: dashboard
    ports:
      - "3002:3002"
    restart: unless-stopped

  sensores:
    build: ./sensores-simulados
    container_name: sensores
    command: ["node_modules/.bin/ts-node", "scripts/load-test.ts"]
    environment:
      MQTT_BROKER_URL: mqtt://${BROKER_IP}:1883
    restart: unless-stopped
```

Subir:

```bash
docker-compose up -d --build
```

O dashboard fica acessível em `http://<IP_PUBLICO_E>:3002`.

---

## Passo 11 — Ordem de inicialização e verificação fim a fim

A ordem correta de subir os serviços é importante porque cada camada depende da anterior:

```
Instância A (Broker) → Instâncias B e C (Coletores) → Instância D (Gateway) → Instância E (Dashboard + Sensores)
```

### Checklist de verificação

> As portas internas (MQTT 1883, gRPC 5005x, AMQP 5672) **não** ficam abertas para a internet — só
> entre as instâncias do grupo. Por isso os testes de MQTT abaixo rodam **de dentro** da instância do
> broker (via `docker exec`), e o de gRPC roda de dentro da Instância B.

**1. Broker no ar (rodar na Instância A):**
```bash
docker exec mqtt-broker mosquitto_sub -t "citypulse/#" -v -C 1 -W 5 || echo "(ok: sem mensagens ainda)"
# Não deve dar erro de conexão
```

**2. Coletores respondendo via gRPC (rodar na Instância B, dentro de ~/citypulse):**
```bash
# Usa a imagem do grpcurl em container + o contrato do repo — não precisa instalar nada
docker run --rm --network host -v "$HOME/citypulse/proto:/proto:ro" fullstorydev/grpcurl \
  -plaintext -import-path /proto -proto citypulse.proto \
  -d '{"zona_id":"centro"}' localhost:50051 citypulse.ZoneCollector/GetZoneStatus
# Deve retornar JSON com status da zona centro e papelNoMomento "PRIMARIO"
```

**3. API REST respondendo (rodar na Instância D, ou de qualquer lugar com o IP público):**
```bash
curl http://<IP_PUBLICO_D>:3000/api/zonas
# Deve retornar JSON com as 4 zonas
```

**4. Dashboard acessível:**
```
Abrir no navegador: http://<IP_PUBLICO_E>:3002
Deve carregar o dashboard sem erro de rede
```

**5. Fluxo completo (publicar de dentro da Instância A):**
```bash
docker exec mqtt-broker mosquitto_pub \
  -t "citypulse/sensores/centro/temperatura" \
  -m '{"sensor_id":"test-01","zona_id":"centro","tipo":"temperatura","valor":42.0,"unidade":"celsius","timestamp":"2026-06-28T15:00:00Z"}'
# Nos próximos segundos, o dashboard deve mostrar temperatura 42°C no Centro
```

**6. Alertas em tempo real (publicar de dentro da Instância A):**
```bash
docker exec mqtt-broker mosquitto_pub \
  -t "citypulse/sensores/centro/qualidade_ar" \
  -m '{"sensor_id":"test-02","zona_id":"centro","tipo":"qualidade_ar","valor":450.0,"unidade":"AQI","timestamp":"2026-06-28T15:00:01Z"}'
# Valor 450 ultrapassa o limite crítico (300) → o feed de alertas no dashboard mostra o alerta em segundos
```

---

## Passo 12 — Demonstração de failover (ponto alto da apresentação)

Esta é a cena mais importante do vídeo. Certifiquem-se de que dois integrantes estejam no ar ao mesmo tempo: um controlando os terminais e outro mostrando o dashboard na tela.

### Preparação

Abrir **3 terminais** simultaneamente:
- Terminal 1: SSH na Instância B (primários)
- Terminal 2: SSH na Instância C (réplicas)
- Terminal 3: acompanhar os logs do Gateway na Instância D

No Terminal 2 e 3, deixar os logs rodando antes de começar:
```bash
# Terminal 2 — Instância C
docker-compose logs -f

# Terminal 3 — Instância D
docker-compose logs -f gateway
```

### Sequência da cena

**Passo A:** mostrar que o sistema está funcionando normalmente — dashboard com status atualizado, sensores publicando.

**Passo B:** mostrar no dashboard qual instância é primária (a tela de replicação que o Integrante 4 construiu).

**Passo C:** no Terminal 1 (Instância B), derrubar os coletores primários. Há duas formas:
```bash
docker-compose kill     # queda abrupta → a réplica detecta na hora (stream cai)
# ou
docker-compose stop     # queda graciosa → a réplica promove em ~6s (timeout de heartbeat)
```

**Passo D:** no Terminal 2 (Instância C), aparece o log real de promoção da réplica. Com `kill`:
```
WARN ServidorReplicacao - [centro] stream do primário encerrou com erro: ...
WARN GerenciadorPapel   - [centro] FAILOVER: réplica promovida a PRIMARIO
```
Com `stop` (via watchdog de heartbeat):
```
WARN ServidorReplicacao - [centro] sem heartbeat do primário há 6xxx ms — promovendo
WARN GerenciadorPapel   - [centro] FAILOVER: réplica promovida a PRIMARIO
```
No Terminal 3 (gateway), aparece o redirecionamento automático para a réplica:
```
WARN GrpcService - zona=centro primário indisponível (gRPC 14), tentando réplica
```

**Passo E:** o dashboard continua atualizando — o gateway redireciona sozinho para a réplica
(failover automático, sem intervenção). Mostrar na tela de replicação que a Instância C assumiu
como primária (`papelNoMomento: PRIMARIO`).

**Passo F:** ainda com os primários parados, publicar uma leitura de teste (Passo 11, item 5) e
confirmar que chegou no dashboard — prova de que o sistema continuou disponível durante a falha.
A réplica promovida passa a consumir o MQTT diretamente.

> **Limitação conhecida (documentar, não "consertar" ao vivo):** não há re-eleição/re-join
> automático. Se você reativar a Instância B (`docker-compose start`), os coletores voltam como
> **PRIMARIO** (valor de `PAPEL_INICIAL`), e ficariam dois primários no ar (split-brain). Por isso,
> **não reative a Instância B durante a apresentação.** Para restaurar o estado limpo depois da demo,
> derrube B e C e suba na ordem A → B → C novamente.

---

## Solução de problemas comuns

**"Connection refused" na porta do broker:**
Verificar se o container mosquitto está rodando: `docker ps`. Verificar se a regra de self-referencing no security group `citypulse-sg` está configurada.

**Erro de build no Java (Out of memory):**
A Instância B é t3.small justamente para ter mais memória durante o build Maven/Gradle. Se ainda ocorrer, adicionar flag de memória: `docker-compose build --build-arg JAVA_OPTS="-Xmx512m"`.

**Dashboard não atualiza em tempo real (WebSocket não conecta):**
O dashboard usa um único endereço, `NEXT_PUBLIC_GATEWAY_URL` (HTTP + WebSocket no mesmo host:porta
do gateway). Conferir que ele aponta para o **IP público** da Instância D na porta 3000 e que a
porta 3000 está aberta no `citypulse-sg`. Lembrando que é build-time: mudou o IP, refazer o build.

**gRPC "UNAVAILABLE" após failover:**
Comportamento esperado e já tratado — o gateway tenta o primário e, ao receber `UNAVAILABLE`/
`DEADLINE_EXCEEDED`, redireciona automaticamente para a réplica (`GrpcService.callWithFailover`).
O `WARN ... tentando réplica` no log é normal durante a transição; nenhuma ação manual é necessária.

**Coletor primário não conecta na réplica ("stream de replicação" não abre):**
Conferir na Instância B que `REPLICA_ADDR` aponta para o IP privado da Instância C na porta de
replicação certa (60051–60054) e que a Instância C publicou essas portas (`60051:60051`, etc.).
A regra self-referencing do `citypulse-sg` precisa estar ativa.

**Réplica sobe como PRIMARIO (failover não acontece):**
Sinal de que `PAPEL_INICIAL=REPLICA` não chegou ao container da Instância C. Conferir o `.env`/
`docker-compose.yml` da réplica (o nome correto é `PAPEL_INICIAL`, não `PAPEL`).

**Variável NEXT_PUBLIC não reflete o IP correto:**
Variáveis `NEXT_PUBLIC_` são resolvidas em build-time, não em runtime. Qualquer mudança de IP exige `docker-compose up -d --build` novamente na Instância E.

---

## Cheatsheet de comandos SSH

```bash
# Conectar em cada instância (substituir o IP público)
ssh -i citypulse-key.pem ec2-user@<IP_PUBLICO>

# Ver logs em tempo real
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f coletor-centro

# Reiniciar um serviço
docker-compose restart <nome-do-servico>

# Parar tudo (simula queda da instância para o failover)
docker-compose stop

# Subir novamente
docker-compose start

# Rebuildar e subir (após mudança de código)
docker-compose up -d --build

# Ver status dos containers
docker ps

# Entrar no container (para debug)
docker exec -it coletor-centro bash
```

---

## Checklist final antes da entrega

- [ ] Todas as 5 instâncias estão no ar e respondendo
- [ ] O dashboard abre no navegador pelo IP público da Instância E
- [ ] Os sensores simulados estão publicando e os dados aparecem no dashboard
- [ ] Alertas chegam em tempo real via WebSocket
- [ ] O failover (parar Instância B, C assume) funciona e foi testado pelo menos uma vez
- [ ] O endpoint `POST /api/zonas/:zonaId/limites` só retorna sucesso após primário e réplica confirmarem
- [ ] Os IPs públicos das instâncias estão registrados no README para o professor acessar durante a correção
- [ ] Os logs da demonstração de failover foram gravados para o vídeo
