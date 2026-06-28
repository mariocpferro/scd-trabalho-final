package com.citypulse.coletor.mqtt;

import com.citypulse.coletor.estado.EstadoZona;
import com.citypulse.coletor.modelo.Leitura;
import com.citypulse.coletor.processamento.AvaliadorLimites;
import com.citypulse.coletor.processamento.Sanitizador;
import com.citypulse.coletor.replicacao.ClienteReplicacao;
import com.citypulse.coletor.replicacao.GerenciadorPapel;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttCallback;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Ingestão das leituras MQTT da zona. Assina citypulse/sensores/{ZONA_ID}/+ e despacha
 * cada mensagem para um pool de threads de ingestão — várias threads escrevem no estado
 * concorrente enquanto o servidor gRPC lê (ponto central de concorrência do trabalho).
 *
 * <p>Apenas o PRIMARIO processa o MQTT diretamente; a réplica recebe o estado pelo stream
 * de replicação. Após um failover, a réplica promovida passa a processar o MQTT (já está
 * inscrita no tópico).
 */
public class IngestaoMqtt implements MqttCallback {

    private static final Logger log = LoggerFactory.getLogger(IngestaoMqtt.class);
    private static final int N_THREADS = 4;

    private final MqttClient client;
    private final String zonaId;
    private final EstadoZona estado;
    private final Sanitizador sanitizador;
    private final AvaliadorLimites avaliador;
    private final GerenciadorPapel gerenciador;
    private final ClienteReplicacao clienteReplicacao; // null na instância réplica

    private final ObjectMapper mapper = new ObjectMapper();
    private final ExecutorService pool = Executors.newFixedThreadPool(N_THREADS, r -> {
        Thread t = new Thread(r);
        t.setName("ingestao-" + t.getId());
        t.setDaemon(true);
        return t;
    });

    public IngestaoMqtt(MqttClient client, String zonaId, EstadoZona estado,
                        Sanitizador sanitizador, AvaliadorLimites avaliador,
                        GerenciadorPapel gerenciador, ClienteReplicacao clienteReplicacao) {
        this.client = client;
        this.zonaId = zonaId;
        this.estado = estado;
        this.sanitizador = sanitizador;
        this.avaliador = avaliador;
        this.gerenciador = gerenciador;
        this.clienteReplicacao = clienteReplicacao;
    }

    public void iniciar() throws Exception {
        client.setCallback(this);
        String topico = "citypulse/sensores/" + zonaId + "/+";
        client.subscribe(topico, 1);
        log.info("[{}] inscrito em {}", zonaId, topico);
    }

    @Override
    public void messageArrived(String topic, MqttMessage message) {
        // Réplica ignora o MQTT direto: seu estado vem do stream do primário.
        if (!gerenciador.ehPrimario()) return;
        byte[] payload = message.getPayload();
        pool.submit(() -> processar(payload));
    }

    private void processar(byte[] payload) {
        try {
            Leitura l = mapper.readValue(payload, Leitura.class);
            if (!sanitizador.valida(l)) return;

            Instant inst = parseInstant(l.timestamp);
            estado.registrarLeitura(l.tipo, l.valor, l.unidade, inst);
            avaliador.avaliar(l.tipo, l.valor);

            if (clienteReplicacao != null) {
                clienteReplicacao.enviar(l.tipo, l.valor, l.unidade, inst.toString());
            }
        } catch (Exception e) {
            log.warn("[{}] payload inválido descartado: {}", zonaId, e.getMessage());
        }
    }

    private Instant parseInstant(String ts) {
        try {
            return (ts == null || ts.isEmpty()) ? Instant.now() : Instant.parse(ts);
        } catch (Exception e) {
            return Instant.now();
        }
    }

    @Override
    public void connectionLost(Throwable cause) {
        log.warn("[{}] conexão MQTT perdida: {}", zonaId,
                cause == null ? "?" : cause.getMessage());
    }

    @Override
    public void deliveryComplete(IMqttDeliveryToken token) { /* não publicamos por aqui */ }

    public void parar() {
        pool.shutdownNow();
    }
}
