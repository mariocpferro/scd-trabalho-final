package com.citypulse.coletor.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Publica alertas no tópico citypulse/alertas/{zona_id} (contrato 4.2),
 * consumido pelo gateway de API (Integrante 3).
 */
public class PublicadorAlertas {

    private static final Logger log = LoggerFactory.getLogger(PublicadorAlertas.class);
    private final ObjectMapper mapper = new ObjectMapper();

    private final MqttClient client;
    private final String zonaId;

    public PublicadorAlertas(MqttClient client, String zonaId) {
        this.client = client;
        this.zonaId = zonaId;
    }

    public void publicar(String tipo, String nivel, double valor, double limite, String mensagem) {
        Map<String, Object> alerta = new LinkedHashMap<>();
        alerta.put("zona_id", zonaId);
        alerta.put("tipo", tipo);
        alerta.put("nivel", nivel);
        alerta.put("valor", valor);
        alerta.put("limite", limite);
        alerta.put("mensagem", mensagem);
        alerta.put("timestamp", Instant.now().toString());

        String topico = "citypulse/alertas/" + zonaId;
        try {
            MqttMessage msg = new MqttMessage(mapper.writeValueAsBytes(alerta));
            msg.setQos(1);
            client.publish(topico, msg);
            log.info("[{}] ALERTA {} → {} ({})", zonaId, nivel, topico, mensagem);
        } catch (Exception e) {
            log.error("[{}] falha ao publicar alerta: {}", zonaId, e.getMessage());
        }
    }
}
