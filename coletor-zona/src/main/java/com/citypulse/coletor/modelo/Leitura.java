package com.citypulse.coletor.modelo;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * DTO da leitura recebida via MQTT (contrato 4.1 da especificação).
 * Tópico: citypulse/sensores/{zona_id}/{tipo}
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class Leitura {
    public String sensor_id;
    public String zona_id;
    public String tipo;
    public double valor;
    public String unidade;
    public String timestamp;
}
