package com.citypulse.coletor.replicacao;

import com.citypulse.grpc.interno.AtualizacaoEstado;
import com.citypulse.grpc.interno.LimiteAck;
import com.citypulse.grpc.interno.LimiteUpdate;
import com.citypulse.grpc.interno.ReplicacaoAck;
import com.citypulse.grpc.interno.ReplicacaoColetorGrpc;
import io.grpc.ManagedChannel;
import io.grpc.netty.shaded.io.grpc.netty.NettyChannelBuilder;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Lado PRIMÁRIO da replicação. Mantém um stream gRPC aberto para a réplica,
 * enviando cada leitura nova e um heartbeat periódico. Reconecta automaticamente
 * se o stream cair ou se a réplica ainda não estiver no ar.
 *
 * <p>Também expõe {@link #aplicarLimiteNaReplica} (chamada unária e síncrona),
 * usada pelo SetThreshold para obter a confirmação da réplica (consistência forte).
 */
public class ClienteReplicacao {

    private static final Logger log = LoggerFactory.getLogger(ClienteReplicacao.class);
    private static final long HEARTBEAT_MS = 2_000;
    private static final long RECONEXAO_MS = 3_000;
    private static final long LIMITE_TIMEOUT_S = 5;

    private final String zonaId;
    private final String replicaAddr;

    private final ManagedChannel channel;
    private final ReplicacaoColetorGrpc.ReplicacaoColetorStub asyncStub;
    private final ReplicacaoColetorGrpc.ReplicacaoColetorBlockingStub blockingStub;

    private final AtomicReference<StreamObserver<AtualizacaoEstado>> stream = new AtomicReference<>();
    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "replicacao-primario");
                t.setDaemon(true);
                return t;
            });

    public ClienteReplicacao(String zonaId, String replicaAddr) {
        this.zonaId = zonaId;
        this.replicaAddr = replicaAddr;
        this.channel = NettyChannelBuilder.forTarget(replicaAddr)
                .usePlaintext()
                .build();
        this.asyncStub = ReplicacaoColetorGrpc.newStub(channel);
        this.blockingStub = ReplicacaoColetorGrpc.newBlockingStub(channel);
    }

    public void iniciar() {
        log.info("[{}] cliente de replicação → réplica em {}", zonaId, replicaAddr);
        abrirStream();
        scheduler.scheduleAtFixedRate(this::heartbeat, HEARTBEAT_MS, HEARTBEAT_MS, TimeUnit.MILLISECONDS);
    }

    private synchronized void abrirStream() {
        if (stream.get() != null) return;
        StreamObserver<ReplicacaoAck> respObserver = new StreamObserver<>() {
            @Override public void onNext(ReplicacaoAck ack) { /* ack final, ignorado */ }

            @Override public void onError(Throwable t) {
                log.warn("[{}] stream de replicação caiu: {} — reconectando", zonaId, t.getMessage());
                stream.set(null);
                scheduler.schedule(ClienteReplicacao.this::abrirStream, RECONEXAO_MS, TimeUnit.MILLISECONDS);
            }

            @Override public void onCompleted() {
                stream.set(null);
            }
        };
        try {
            stream.set(asyncStub.replicarEstado(respObserver));
            log.info("[{}] stream de replicação aberto", zonaId);
        } catch (Exception e) {
            log.warn("[{}] não foi possível abrir stream ({}); nova tentativa em {}ms",
                    zonaId, e.getMessage(), RECONEXAO_MS);
            scheduler.schedule(this::abrirStream, RECONEXAO_MS, TimeUnit.MILLISECONDS);
        }
    }

    /** Replica uma leitura nova para a réplica (best-effort; se o stream estiver caído, ignora). */
    public void enviar(String tipo, double valor, String unidade, String timestamp) {
        StreamObserver<AtualizacaoEstado> obs = stream.get();
        if (obs == null) return;
        try {
            obs.onNext(AtualizacaoEstado.newBuilder()
                    .setHeartbeat(false)
                    .setTipo(tipo)
                    .setValor(valor)
                    .setUnidade(unidade == null ? "" : unidade)
                    .setTimestamp(timestamp == null ? "" : timestamp)
                    .build());
        } catch (Exception e) {
            log.debug("[{}] falha ao enviar update (stream instável): {}", zonaId, e.getMessage());
            stream.set(null);
        }
    }

    private void heartbeat() {
        StreamObserver<AtualizacaoEstado> obs = stream.get();
        if (obs == null) { abrirStream(); return; }
        try {
            obs.onNext(AtualizacaoEstado.newBuilder().setHeartbeat(true).build());
        } catch (Exception e) {
            stream.set(null);
        }
    }

    /**
     * Aplica o limite na réplica de forma síncrona e retorna se foi confirmado.
     * Usado pelo SetThreshold para garantir consistência forte primário+réplica.
     */
    public boolean aplicarLimiteNaReplica(String tipo, double limite, String nivel) {
        try {
            LimiteAck ack = blockingStub
                    .withDeadlineAfter(LIMITE_TIMEOUT_S, TimeUnit.SECONDS)
                    .aplicarLimite(LimiteUpdate.newBuilder()
                            .setTipo(tipo)
                            .setLimite(limite)
                            .setNivel(nivel)
                            .build());
            return ack.getAplicado();
        } catch (Exception e) {
            log.error("[{}] réplica não confirmou o limite: {}", zonaId, e.getMessage());
            return false;
        }
    }

    public void parar() {
        scheduler.shutdownNow();
        StreamObserver<AtualizacaoEstado> obs = stream.getAndSet(null);
        if (obs != null) {
            try { obs.onCompleted(); } catch (Exception ignored) { }
        }
        channel.shutdownNow();
    }
}
