package com.citypulse.coletor.modelo;

/** Valor atual de uma métrica (última leitura sanitizada de um tipo). Imutável. */
public final class Metrica {
    public final String tipo;
    public final double valor;
    public final String unidade;
    public final String timestamp;

    public Metrica(String tipo, double valor, String unidade, String timestamp) {
        this.tipo = tipo;
        this.valor = valor;
        this.unidade = unidade;
        this.timestamp = timestamp;
    }
}
