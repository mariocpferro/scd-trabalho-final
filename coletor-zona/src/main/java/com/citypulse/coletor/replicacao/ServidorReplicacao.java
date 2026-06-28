package com.citypulse.coletor.replicacao;

import com.citypulse.coletor.estado.EstadoZona;
import com.citypulse.coletor.modelo.Limite;
import com.citypulse.grpc.interno.AtualizacaoEstado;
import com.citypulse.grpc.interno.LimiteAck;
import com.citypulse.grpc.interno.LimiteUpdate;
import com.citypulse.grpc.interno.ReplicacaoAck;
import com.citypulse.grpc.interno.ReplicacaoColetorGrpc;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Lado RÉPLICA da replicação (serviço gRPC interno). Recebe o stream de atualizações
 * do primário e as aplica no estado local. Um watchdog monitora o heartbeat: se o
 * primário parar de enviar (ou o stream cair), promove esta instância a PRIMARIO.
 */
public class ServidorReplicacao extends ReplicacaoColetorGrpc.ReplicacaoColetorImplBase {

    private static final Logger log = LoggerFactory.getLogger(ServidorReplicacao.class);

    /** Sem heartbeat por este tempo após o primeiro contato ⇒ primário considerado morto. */
    private static final long TIMEOUT_MS = 6_000;
    private static final long CHECK_MS = 1_000;

    private final EstadoZona estado;
    private final GerenciadorPapel gerenciador;

    private final AtomicLong ultimoContato = new AtomicLong(0);
    private final AtomicBoolean contatoEstabelecido = new AtomicBoolean(false);
    private final ScheduledExecutorService watchdog =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "replicacao-watchdog");
                t.setDaemon(true);
                return t;
            });

    public ServidorReplicacao(EstadoZona estado, GerenciadorPapel gerenciador) {
        this.estado = estado;
        this.gerenciador = gerenciador;
    }

    public void iniciarWatchdog() {
        watchdog.scheduleAtFixedRate(this::verificar, CHECK_MS, CHECK_MS, TimeUnit.MILLISECONDS);
        log.info("[{}] watchdog de heartbeat iniciado (timeout={}ms)", estado.getZonaId(), TIMEOUT_MS);
    }

    private void verificar() {
        if (gerenciador.ehPrimario()) return;            // já promovido
        if (!contatoEstabelecido.get()) return;          // ainda não falou com o primário
        long ocioso = System.currentTimeMillis() - ultimoContato.get();
        if (ocioso > TIMEOUT_MS) {
            log.warn("[{}] sem heartbeat do primário há {}ms — promovendo", estado.getZonaId(), ocioso);
            gerenciador.promover();
        }
    }

    @Override
    public StreamObserver<AtualizacaoEstado> replicarEstado(StreamObserver<ReplicacaoAck> responseObserver) {
        marcarContato();
        return new StreamObserver<>() {
            @Override
            public void onNext(AtualizacaoEstado upd) {
                marcarContato();
                if (upd.getHeartbeat()) return;
                Instant inst = parseInstant(upd.getTimestamp());
                estado.registrarLeitura(upd.getTipo(), upd.getValor(), upd.getUnidade(), inst);
            }

            @Override
            public void onError(Throwable t) {
                // Stream caiu: provável queda do primário → promoção imediata.
                log.warn("[{}] stream do primário encerrou com erro: {}", estado.getZonaId(), t.getMessage());
                gerenciador.promover();
            }

            @Override
            public void onCompleted() {
                log.info("[{}] primário encerrou o stream", estado.getZonaId());
                responseObserver.onNext(ReplicacaoAck.newBuilder().setOk(true).build());
                responseObserver.onCompleted();
            }
        };
    }

    @Override
    public void aplicarLimite(LimiteUpdate req, StreamObserver<LimiteAck> responseObserver) {
        boolean acimaDispara = !"vagas_estacionamento".equals(req.getTipo());
        estado.setLimite(req.getTipo(), new Limite(req.getLimite(), req.getNivel(), acimaDispara));
        log.info("[{}] limite aplicado na réplica: {} = {} ({})",
                estado.getZonaId(), req.getTipo(), req.getLimite(), req.getNivel());
        responseObserver.onNext(LimiteAck.newBuilder().setAplicado(true).build());
        responseObserver.onCompleted();
    }

    private void marcarContato() {
        ultimoContato.set(System.currentTimeMillis());
        contatoEstabelecido.set(true);
    }

    private Instant parseInstant(String ts) {
        try {
            return (ts == null || ts.isEmpty()) ? Instant.now() : Instant.parse(ts);
        } catch (Exception e) {
            return Instant.now();
        }
    }

    public void parar() {
        watchdog.shutdownNow();
    }
}
