# Sensores Simulados — CityPulse

Simuladores de sensores para as 4 zonas da cidade (Centro, Norte, Sul, Leste), publicando leituras via MQTT.

## Pré-requisitos

- [Node.js 20+](https://nodejs.org/)
- [Docker](https://www.docker.com/) e Docker Compose

---

## Rodando localmente (sem Docker)

### 1. Instalar dependências

```bash
cd sensores-simulados
npm install
```

### 2. Subir o Mosquitto via Docker

```bash
docker-compose up mosquitto
```

### 3. Rodar um sensor

Copie o arquivo de exemplo e ajuste as variáveis:

```bash
cp .env.example .env
```

Edite o `.env` com os valores desejados e rode:

```bash
npm run sensor
```

Ou passe as variáveis direto no comando:

```bash
SENSOR_ID=sensor-centro-temp-01 ZONA_ID=centro TIPO=temperatura npm run sensor
```

### 4. Rodar o serviço de ingestão REST

```bash
npm run ingestao
```

O serviço sobe na porta `3001`. Para registrar um sensor manualmente:

```bash
curl -X POST http://localhost:3001/sensores/registrar \
  -H "Content-Type: application/json" \
  -d '{"sensor_id": "sensor-centro-temp-01", "zona_id": "centro", "tipo": "temperatura"}'
```

---

## Rodando tudo com Docker Compose

### 1. Subir todos os serviços

Na raiz do projeto:

```bash
docker-compose up --build
```

Isso sobe o Mosquitto, o serviço de ingestão e os 16 sensores (um por tipo por zona).

### 2. Verificar as mensagens MQTT

Em outro terminal, execute o `mosquitto_sub` dentro do container:

```bash
docker exec citypulse-mosquitto mosquitto_sub -h localhost -t "citypulse/sensores/#" -v
```

Você verá as mensagens chegando em tempo real, por exemplo:

```
citypulse/sensores/centro/temperatura {"sensor_id":"sensor-centro-temp-01","zona_id":"centro","tipo":"temperatura","valor":24.3,"unidade":"celsius","timestamp":"2026-06-19T13:00:00.000Z"}
```

### 3. Verificar sensores registrados

```bash
curl http://localhost:3001/sensores
```

### 4. Parar tudo

```bash
docker-compose down
```

---

## Script de carga (teste de concorrência)

Sobe 64 sensores simultaneamente (4 por tipo por zona) com intervalo de publicação de 1–3s:

```bash
cd sensores-simulados
MQTT_BROKER_URL=mqtt://localhost:1883 npm run carga
```

Para aumentar a carga, ajuste a variável `NUM_SENSORES_POR_TIPO`:

```bash
NUM_SENSORES_POR_TIPO=10 MQTT_BROKER_URL=mqtt://localhost:1883 npm run carga
```

---

## Variáveis de ambiente

| Variável | Descrição | Padrão |
|---|---|---|
| `SENSOR_ID` | Identificador único do sensor | obrigatório |
| `ZONA_ID` | Zona da cidade (`centro`, `norte`, `sul`, `leste`) | obrigatório |
| `TIPO` | Tipo do sensor (`temperatura`, `qualidade_ar`, `vagas_estacionamento`, `consumo_energia`) | obrigatório |
| `MQTT_BROKER_URL` | URL do broker MQTT | `mqtt://localhost:1883` |
| `INTERVALO_MIN_MS` | Intervalo mínimo de publicação (ms) | `5000` |
| `INTERVALO_MAX_MS` | Intervalo máximo de publicação (ms) | `15000` |
| `INGESTAO_PORT` | Porta do serviço de ingestão REST | `3001` |
