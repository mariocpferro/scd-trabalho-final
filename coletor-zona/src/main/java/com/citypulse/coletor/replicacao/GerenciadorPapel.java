package com.citypulse.coletor.replicacao;

import com.citypulse.coletor.modelo.Papel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicReference;

/**
 * Mantém o papel atual (PRIMARIO/REPLICA) da instância de forma thread-safe.
 * A promoção de réplica para primário acontece quando o heartbeat do primário
 * para de chegar (ver {@link ServidorReplicacao}).
 */
public class GerenciadorPapel {

    private static final Logger log = LoggerFactory.getLogger(GerenciadorPapel.class);

    private final AtomicReference<Papel> papel;
    private final String zonaId;

    public GerenciadorPapel(String zonaId, Papel inicial) {
        this.zonaId = zonaId;
        this.papel = new AtomicReference<>(inicial);
        log.info("[{}] papel inicial = {}", zonaId, inicial);
    }

    public Papel papel() {
        return papel.get();
    }

    public boolean ehPrimario() {
        return papel.get() == Papel.PRIMARIO;
    }

    /** Promove para PRIMARIO. Idempotente — só age na transição REPLICA→PRIMARIO. */
    public void promover() {
        if (papel.compareAndSet(Papel.REPLICA, Papel.PRIMARIO)) {
            log.warn("[{}] FAILOVER: réplica promovida a PRIMARIO", zonaId);
        }
    }
}
