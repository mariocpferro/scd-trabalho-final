package com.citypulse.coletor.modelo;

import java.time.Instant;

/** Ponto histórico de uma série temporal. Imutável. */
public final class DataPoint {
    public final Instant instante;
    public final double valor;

    public DataPoint(Instant instante, double valor) {
        this.instante = instante;
        this.valor = valor;
    }
}
