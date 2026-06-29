package com.citypulse.coletor;

import com.citypulse.coletor.estado.EstadoZona;
import com.citypulse.coletor.grpc.ZoneCollectorServico;
import com.citypulse.coletor.modelo.Papel;
import com.citypulse.coletor.mqtt.IngestaoMqtt;
import com.citypulse.coletor.mqtt.PublicadorAlertas;
import com.citypulse.coletor.processamento.Agregador;
import com.citypulse.coletor.processamento.AvaliadorLimites;
import com.citypulse.coletor.processamento.Sanitizador;
import com.citypulse.coletor.replicacao.ClienteReplicacao;
import com.citypulse.coletor.replicacao.GerenciadorPapel;
import com.citypulse.coletor.replicacao.ServidorReplicacao;
import io.grpc.Server;
import io.grpc.netty.shaded.io.grpc.netty.NettyServerBuilder;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Ponto de entrada do Coletor de Zona. Um único binário, parametrizado por variáveis de
 * ambiente, que sobe como PRIMARIO ou RÉPLICA de uma zona.
 *
 * Variáveis de ambiente:
 *   ZONA_ID          centro | norte | sul | leste            (obrigatória)
 *   PAPEL_INICIAL    PRIMARIO | REPLICA                       (default PRIMARIO)
 *   GRPC_PORT        porta do serviço ZoneCollector           (default 50051)
 *   MQTT_BROKER_URL  ex.: tcp://mosquitto:1883                (default tcp://localhost:1883)
 *   REPLICA_ADDR     host:porta da réplica (só no PRIMARIO)   ex.: coletor-centro-replica:60051
 *   REPLICACAO_PORT  porta do serviço interno (só na RÉPLICA) default 60051
 */
public class App {

    private static final Logger log = LoggerFactory.getLogger(App.class);

    public static void main(String[] args) throws Exception {
        String zonaId = env("ZONA_ID", null);
        if (zonaId == null || zonaId.isBlank()) {
            throw new IllegalStateException("ZONA_ID é obrigatória");
        }
        Papel papelInicial = Papel.valueOf(env("PAPEL_INICIAL", "PRIMARIO").toUpperCase());
        int grpcPort = Integer.parseInt(env("GRPC_PORT", "50051"));
        String brokerUrl = env("MQTT_BROKER_URL", "tcp://localhost:1883");
        String replicaAddr = env("REPLICA_ADDR", null);
        int replicacaoPort = Integer.parseInt(env("REPLICACAO_PORT", "60051"));

        log.info("==== Coletor de Zona | zona={} papel={} grpc={} ====", zonaId, papelInicial, grpcPort);

        EstadoZona estado = new EstadoZona(zonaId);
        GerenciadorPapel gerenciador = new GerenciadorPapel(zonaId, papelInicial);

        // ── MQTT (conexão compartilhada para ingestão e publicação de alertas) ──
        MqttClient mqtt = conectarMqtt(brokerUrl, zonaId, papelInicial);
        PublicadorAlertas publicador = new PublicadorAlertas(mqtt, zonaId);
        AvaliadorLimites avaliador = new AvaliadorLimites(estado, publicador, gerenciador);
        Sanitizador sanitizador = new Sanitizador();

        // ── Replicação ──
        ClienteReplicacao clienteReplicacao = null;
        ServidorReplicacao servidorReplicacao = null;
        Server servidorInterno = null;

        if (papelInicial == Papel.PRIMARIO) {
            if (replicaAddr == null || replicaAddr.isBlank()) {
                log.warn("[{}] PRIMARIO sem REPLICA_ADDR — replicação e SetThreshold forte indisponíveis", zonaId);
            } else {
                clienteReplicacao = new ClienteReplicacao(zonaId, replicaAddr);
                clienteReplicacao.iniciar();
            }
        } else { // RÉPLICA
            servidorReplicacao = new ServidorReplicacao(estado, gerenciador);
            servidorInterno = NettyServerBuilder.forPort(replicacaoPort)
                    .addService(servidorReplicacao)
                    .build()
                    .start();
            servidorReplicacao.iniciarWatchdog();
            log.info("[{}] serviço interno de replicação ouvindo em :{}", zonaId, replicacaoPort);
        }

        // ── Servidor gRPC ZoneCollector (contrato compartilhado) ──
        Server servidorZone = NettyServerBuilder.forPort(grpcPort)
                .addService(new ZoneCollectorServico(estado, gerenciador, clienteReplicacao))
                .build()
                .start();
        log.info("[{}] ZoneCollector gRPC ouvindo em :{}", zonaId, grpcPort);

        // ── Ingestão MQTT (pool de threads) ──
        IngestaoMqtt ingestao = new IngestaoMqtt(
                mqtt, zonaId, estado, sanitizador, avaliador, gerenciador, clienteReplicacao);
        ingestao.iniciar();

        // ── Processamento em segundo plano ──
        Agregador agregador = new Agregador(estado);
        agregador.iniciar();

        // ── Encerramento limpo ──
        final ClienteReplicacao fCliente = clienteReplicacao;
        final ServidorReplicacao fServ = servidorReplicacao;
        final Server fServInterno = servidorInterno;
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            log.info("[{}] encerrando...", zonaId);
            ingestao.parar();
            agregador.parar();
            if (fCliente != null) fCliente.parar();
            if (fServ != null) fServ.parar();
            servidorZone.shutdownNow();
            if (fServInterno != null) fServInterno.shutdownNow();
            try { mqtt.disconnectForcibly(); } catch (Exception ignored) { }
        }));

        servidorZone.awaitTermination();
    }

    private static MqttClient conectarMqtt(String brokerUrl, String zonaId, Papel papel) throws Exception {
        String clientId = "coletor-" + zonaId + "-" + papel.name().toLowerCase()
                + "-" + ProcessHandle.current().pid();
        MqttClient client = new MqttClient(brokerUrl, clientId, new MemoryPersistence());
        MqttConnectOptions opts = new MqttConnectOptions();
        opts.setCleanSession(true);
        opts.setAutomaticReconnect(true);
        opts.setConnectionTimeout(10);
        client.connect(opts);
        log.info("[{}] conectado ao broker MQTT {} (clientId={})", zonaId, brokerUrl, clientId);
        return client;
    }

    private static String env(String chave, String padrao) {
        String v = System.getenv(chave);
        return (v == null || v.isBlank()) ? padrao : v;
    }
}
