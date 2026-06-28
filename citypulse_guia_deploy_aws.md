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
| **E — Dashboard** | Next.js + Sensores simulados | t3.micro | Público (porta 3001) |

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
| Custom TCP | TCP | 3001 | `0.0.0.0/0` | Dashboard público |
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
      - RABBITMQ_DEFAULT_PASS=citypulse123
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

Criar o arquivo `.env` na Instância B (substituindo pelos IPs reais):

```env
BROKER_HOST=10.0.1.10
BROKER_PORT=1883
PAPEL=PRIMARIO
REPLICA_HOST=10.0.1.30
REPLICA_SYNC_PORT_CENTRO=50061
REPLICA_SYNC_PORT_NORTE=50062
REPLICA_SYNC_PORT_SUL=50063
REPLICA_SYNC_PORT_LESTE=50064
```

Criar o `docker-compose.yml`:

```yaml
version: '3.8'

services:
  coletor-centro:
    build: .
    container_name: coletor-centro
    ports:
      - "50051:50051"
    environment:
      - ZONA_ID=centro
      - GRPC_PORT=50051
      - BROKER_HOST=${BROKER_HOST}
      - BROKER_PORT=${BROKER_PORT}
      - PAPEL=${PAPEL}
      - REPLICA_HOST=${REPLICA_HOST}
      - REPLICA_SYNC_PORT=${REPLICA_SYNC_PORT_CENTRO}
    restart: unless-stopped

  coletor-norte:
    build: .
    container_name: coletor-norte
    ports:
      - "50052:50051"
    environment:
      - ZONA_ID=norte
      - GRPC_PORT=50051
      - BROKER_HOST=${BROKER_HOST}
      - BROKER_PORT=${BROKER_PORT}
      - PAPEL=${PAPEL}
      - REPLICA_HOST=${REPLICA_HOST}
      - REPLICA_SYNC_PORT=${REPLICA_SYNC_PORT_NORTE}
    restart: unless-stopped

  coletor-sul:
    build: .
    container_name: coletor-sul
    ports:
      - "50053:50051"
    environment:
      - ZONA_ID=sul
      - GRPC_PORT=50051
      - BROKER_HOST=${BROKER_HOST}
      - BROKER_PORT=${BROKER_PORT}
      - PAPEL=${PAPEL}
      - REPLICA_HOST=${REPLICA_HOST}
      - REPLICA_SYNC_PORT=${REPLICA_SYNC_PORT_SUL}
    restart: unless-stopped

  coletor-leste:
    build: .
    container_name: coletor-leste
    ports:
      - "50054:50051"
    environment:
      - ZONA_ID=leste
      - GRPC_PORT=50051
      - BROKER_HOST=${BROKER_HOST}
      - BROKER_PORT=${BROKER_PORT}
      - PAPEL=${PAPEL}
      - REPLICA_HOST=${REPLICA_HOST}
      - REPLICA_SYNC_PORT=${REPLICA_SYNC_PORT_LESTE}
    restart: unless-stopped
```

Subir (o build da imagem Java pode demorar alguns minutos):

```bash
docker-compose up -d --build
```

---

## Passo 8 — Deploy da Instância C (Coletores Réplica)

Idêntico ao Passo 7, exceto pelo `.env`:

```env
BROKER_HOST=10.0.1.10
BROKER_PORT=1883
PAPEL=REPLICA
PRIMARIO_HOST=10.0.1.20
REPLICA_SYNC_PORT_CENTRO=50061
REPLICA_SYNC_PORT_NORTE=50062
REPLICA_SYNC_PORT_SUL=50063
REPLICA_SYNC_PORT_LESTE=50064
```

O mesmo `docker-compose.yml` funciona — a diferença de comportamento (primário vs. réplica) é controlada pela variável `PAPEL`. Subir da mesma forma:

```bash
docker-compose up -d --build
```

---

## Passo 9 — Deploy da Instância D (Gateway + Worker)

Criar o `.env`:

```env
# Broker
BROKER_HOST=10.0.1.10
BROKER_PORT=1883
AMQP_URL=amqp://citypulse:citypulse123@10.0.1.10:5672

# Coletores primários (gRPC)
COLETOR_CENTRO=10.0.1.20:50051
COLETOR_NORTE=10.0.1.20:50052
COLETOR_SUL=10.0.1.20:50053
COLETOR_LESTE=10.0.1.20:50054

# Coletores réplica (fallback)
COLETOR_CENTRO_REPLICA=10.0.1.30:50051
COLETOR_NORTE_REPLICA=10.0.1.30:50052
COLETOR_SUL_REPLICA=10.0.1.30:50053
COLETOR_LESTE_REPLICA=10.0.1.30:50054

# API
PORT=3000
CORS_ORIGIN=http://<IP_PUBLICO_INSTANCIA_E>:3001
```

Criar o `docker-compose.yml`:

```yaml
version: '3.8'

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

---

## Passo 10 — Deploy da Instância E (Dashboard + Sensores)

Criar o `.env`:

```env
# Endereço público do gateway (IP público da Instância D)
NEXT_PUBLIC_API_URL=http://<IP_PUBLICO_INSTANCIA_D>:3000
NEXT_PUBLIC_WS_URL=ws://<IP_PUBLICO_INSTANCIA_D>:3000

# Broker para os sensores simulados
BROKER_HOST=10.0.1.10
BROKER_PORT=1883
```

> **Atenção:** variáveis com prefixo `NEXT_PUBLIC_` são embutidas no bundle do Next.js em tempo de build. Portanto, o IP público do Gateway deve estar definido antes de rodar `docker-compose up --build`.

Criar o `docker-compose.yml`:

```yaml
version: '3.8'

services:
  dashboard:
    build: ./dashboard
    container_name: dashboard
    ports:
      - "3001:3001"
    env_file: .env
    restart: unless-stopped

  sensores:
    build: ./sensores-simulados
    container_name: sensores
    env_file: .env
    restart: unless-stopped
```

Subir:

```bash
docker-compose up -d --build
```

---

## Passo 11 — Ordem de inicialização e verificação fim a fim

A ordem correta de subir os serviços é importante porque cada camada depende da anterior:

```
Instância A (Broker) → Instâncias B e C (Coletores) → Instância D (Gateway) → Instância E (Dashboard + Sensores)
```

### Checklist de verificação

**1. Broker no ar:**
```bash
# Testar MQTT manualmente (instalar mosquitto-clients localmente ou em qualquer instância)
mosquitto_sub -h <IP_PUBLICO_A> -p 1883 -t "citypulse/#" -v
# Deve ficar aguardando (sem erro de conexão)
```

**2. Coletores respondendo via gRPC:**
```bash
# Usar grpcurl (instalar com: brew install grpcurl ou go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest)
grpcurl -plaintext <IP_PUBLICO_B>:50051 citypulse.ZoneCollector/GetZoneStatus
# Deve retornar JSON com status da zona centro
```

**3. API REST respondendo:**
```bash
curl http://<IP_PUBLICO_D>:3000/api/zonas
# Deve retornar JSON com as 4 zonas
```

**4. Dashboard acessível:**
```
Abrir no navegador: http://<IP_PUBLICO_E>:3001
Deve carregar o dashboard sem erro de rede
```

**5. Fluxo completo:**
```bash
# Publicar uma leitura de teste diretamente no broker
mosquitto_pub -h <IP_PUBLICO_A> -p 1883 \
  -t "citypulse/sensores/centro/temperatura" \
  -m '{"sensor_id":"test-01","zona_id":"centro","tipo":"temperatura","valor":42.0,"unidade":"celsius","timestamp":"2026-06-17T15:00:00Z"}'

# Nos próximos segundos, o dashboard deve mostrar temperatura 42°C no Centro
```

**6. Alertas em tempo real (WebSocket):**
```bash
# Publicar valor acima do limite configurado
mosquitto_pub -h <IP_PUBLICO_A> -p 1883 \
  -t "citypulse/sensores/centro/qualidade_ar" \
  -m '{"sensor_id":"test-02","zona_id":"centro","tipo":"qualidade_ar","valor":450.0,"unidade":"iqa","timestamp":"2026-06-17T15:00:01Z"}'

# O feed de alertas no dashboard deve mostrar o alerta em segundos
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

**Passo C:** no Terminal 1 (Instância B), derrubar todos os coletores primários:
```bash
docker-compose stop
```

**Passo D:** nos próximos 5-15 segundos (depende do intervalo de heartbeat configurado), o Terminal 2 deve mostrar o log de promoção da réplica:
```
[REPLICA] Heartbeat perdido do primário da zona centro. Promovendo para PRIMARIO.
[REPLICA] Promovido para PRIMARIO da zona centro. Notificando gateway.
```

**Passo E:** o dashboard deve continuar atualizando. Mostrar na tela de replicação que a Instância C assumiu como primária.

**Passo F:** ainda com os primários parados, publicar uma leitura de teste e confirmar que ela chegou no dashboard — prova de que o sistema continuou disponível durante a falha.

**Passo G (opcional, impressiona):** subir a Instância B novamente:
```bash
docker-compose start
```

Os coletores devem se reconectar como réplica (já que C é agora primária) e sincronizar o estado perdido.

---

## Solução de problemas comuns

**"Connection refused" na porta do broker:**
Verificar se o container mosquitto está rodando: `docker ps`. Verificar se a regra de self-referencing no security group `citypulse-sg` está configurada.

**Erro de build no Java (Out of memory):**
A Instância B é t3.small justamente para ter mais memória durante o build Maven/Gradle. Se ainda ocorrer, adicionar flag de memória: `docker-compose build --build-arg JAVA_OPTS="-Xmx512m"`.

**Dashboard não atualiza em tempo real (WebSocket não conecta):**
Verificar que a variável `NEXT_PUBLIC_WS_URL` usa `ws://` e não `http://`. WebSocket não funciona sobre HTTP no Next.js sem configuração extra. Verificar também que a porta 3000 está aberta no security group.

**gRPC "UNAVAILABLE" após failover:**
O gateway precisa implementar retry com backoff. Se não foi implementado, forçar restart do gateway após o failover: `docker-compose restart gateway` na Instância D. Para a apresentação, esse comportamento pode ser mencionado como uma melhoria futura.

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
