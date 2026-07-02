# CityPulse — Plataforma de Monitoramento de Cidade Inteligente

Trabalho final da disciplina **Software Concorrente e Distribuído** — Instituto de Informática, UFG.
Professor: Fábio Moreira Costa. Semestre: 2026.1.

> A documentação de arquitetura e implementação (com diagramas e detalhamento de cada componente) está no
> arquivo **`CityPulse_Documentacao.pdf`** entregue à parte. Este README foca em **como instalar e executar**
> o sistema localmente.

---

## Integrantes

| Integrante        | Componente responsável                   | Tecnologia                     |
| ----------------- | ---------------------------------------- | ------------------------------ |
| **Mário Ferro**   | Sensores simulados + serviço de ingestão | TypeScript (Node.js)           |
| **Osmário Filho** | Coletor de Zona                          | Java                           |
| **Allan Bispo**   | Gateway de API                           | TypeScript (NestJS)            |
| **Douglas Rocha** | Dashboard + Worker de manutenção         | TypeScript (Next.js / Node.js) |

---

## Pré-requisitos

Só é necessário **Docker** e **Docker Compose v2** — todos os serviços rodam em containers, então **não**
precisa instalar Java, Node, Maven, etc. na máquina.

```bash
docker --version           # confirmar que o Docker está instalado
docker compose version     # confirmar o Compose v2 (comando com espaço)
```

Deixe livres as portas usadas pelo sistema: **3002** (dashboard), **3000** (gateway/API), **3001**
(ingestão), **15672** (painel RabbitMQ), **1883** (MQTT) e **50051–50058** (gRPC dos coletores).

---

## Executar o sistema completo

A partir da raiz do repositório:

```bash
git clone https://github.com/mariocpferro/scd-trabalho-final.git
cd scd-trabalho-final
docker compose up -d --build
```

- `-d` roda em segundo plano; `--build` compila as imagens.
- A **primeira** execução demora alguns minutos (a imagem do Coletor de Zona é compilada com Maven).
- O Compose sobe tudo na ordem certa (broker → coletores → gateway → dashboard/worker → sensores) via
  `depends_on`. Os sensores começam a publicar sozinhos, então o dashboard já aparece com dados em poucos
  segundos.

Confirme que subiu:

```bash
docker compose ps          # todos os serviços devem estar "Up"
```

Depois, abra no navegador: **http://localhost:3002** (dashboard).

Para parar tudo:

```bash
docker compose down        # para e remove os containers
```

---

## Acessos

| Serviço                           | Endereço                | Observação                                        |
| --------------------------------- | ----------------------- | ------------------------------------------------- |
| **Dashboard**                     | http://localhost:3002   | interface principal (status, histórico, alertas)  |
| **API REST (Gateway)**            | http://localhost:3000   | ex.: `GET /api/zonas`                             |
| **Ingestão (registro de sensor)** | http://localhost:3001   | `POST /sensores/registrar`                        |
| **Painel do RabbitMQ**            | http://localhost:15672  | usuário `citypulse` / senha `citypulse`           |

Verificação rápida pela linha de comando:

```bash
curl http://localhost:3000/api/zonas
curl http://localhost:3000/api/zonas/centro/status
```

---

## Operações comuns

```bash
docker compose ps                          # status de todos os serviços
docker compose logs -f                     # logs de todos (Ctrl+C para sair)
docker compose logs -f gateway-api         # logs de um serviço específico
docker compose restart <serviço>           # reiniciar um serviço
docker compose stop <serviço>              # parar um serviço (fica parado)
docker compose start <serviço>             # subir novamente um serviço parado
docker compose up -d --build <serviço>     # recompilar e subir só um serviço (após mudar código)
docker compose down && docker compose up -d --build   # recomeçar do zero
```

**Nomes dos serviços** (para usar nos comandos acima): `mosquitto`, `rabbitmq`, `ingestao`,
`coletor-centro`, `coletor-centro-replica`, `coletor-norte`, `coletor-norte-replica`, `coletor-sul`,
`coletor-sul-replica`, `coletor-leste`, `coletor-leste-replica`, `gateway-api`, `dashboard`,
`worker-manutencao`, e os sensores `sensor-<zona>-<tipo>`. Veja a lista completa com `docker compose ps`.

---

## Serviços e portas

| Pasta                 | Serviço(s)                         | Porta(s)                          |
| --------------------- | ---------------------------------- | --------------------------------- |
| `sensores-simulados/` | `ingestao` + `sensor-*`            | 3001 (ingestão)                   |
| `coletor-zona/`       | `coletor-<zona>` + `-replica`      | 50051–50054 (primários), 50055–50058 (réplicas) |
| `gateway-api/`        | `gateway-api`                      | 3000                              |
| `dashboard/`          | `dashboard`                        | 3002                              |
| `worker-manutencao/`  | `worker-manutencao`                | — (consome fila RabbitMQ)         |
| infra                 | `mosquitto` (MQTT), `rabbitmq`     | 1883 / 5672 + 15672               |

---

## Roteiro de teste (local)

Os comandos publicam no broker de dentro do próprio container, então **não exigem instalar nada**.

**1. Fluxo fim a fim** — uma leitura chega ao dashboard:
```bash
docker exec citypulse-mosquitto mosquitto_pub \
  -t "citypulse/sensores/centro/temperatura" \
  -m '{"sensor_id":"teste","zona_id":"centro","tipo":"temperatura","valor":42.0,"unidade":"celsius","timestamp":"2026-06-29T12:00:00Z"}'
# Em segundos, a zona Centro reflete a temperatura no dashboard (http://localhost:3002).
```

**2. Alerta em tempo real** — valor acima do limite crítico:
```bash
docker exec citypulse-mosquitto mosquitto_pub \
  -t "citypulse/sensores/centro/qualidade_ar" \
  -m '{"sensor_id":"teste","zona_id":"centro","tipo":"qualidade_ar","valor":450,"unidade":"AQI","timestamp":"2026-06-29T12:00:01Z"}'
# 450 ultrapassa o limite (300) → alerta aparece no feed do dashboard.
```

**3. Failover** — replicação e disponibilidade:
```bash
docker compose stop coletor-centro                 # derruba o primário da zona centro
curl http://localhost:3000/api/zonas/centro/status # o gateway passa a responder pela réplica
docker compose start coletor-centro                # restaurar depois
```

**4. Concorrência** — abra duas abas do dashboard e rode o comando do passo 2: ambas recebem o mesmo
alerta ao mesmo tempo.

---

## Solução de problemas

- **Porta ocupada:** pare o processo que usa a porta ou ajuste o mapeamento no `docker-compose.yml`.
- **Primeira subida lenta:** normal — a imagem Java é compilada com Maven na primeira vez.
- **Dashboard sem dados:** confira `docker compose ps` (tudo `Up`) e aguarde alguns segundos; os sensores
  publicam em intervalos.
- **Algum serviço reiniciando:** veja o log dele com `docker compose logs -f <serviço>`.
- **Recomeçar limpo:** `docker compose down` e depois `docker compose up -d --build`.
