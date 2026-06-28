package com.citypulse.coletor.grpc;

import com.citypulse.coletor.estado.EstadoZona;
import com.citypulse.coletor.modelo.Limite;
import com.citypulse.coletor.modelo.Metrica;
import com.citypulse.coletor.replicacao.ClienteReplicacao;
import com.citypulse.coletor.replicacao.GerenciadorPapel;
import com.citypulse.grpc.HistoryRequest;
import com.citypulse.grpc.HistoryResponse;
import com.citypulse.grpc.Metric;
import com.citypulse.grpc.ThresholdAck;
import com.citypulse.grpc.ThresholdRequest;
import com.citypulse.grpc.ZoneCollectorGrpc;
import com.citypulse.grpc.ZoneRequest;
import com.citypulse.grpc.ZoneStatus;
import io.grpc.stub.StreamObserver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

/**
 * Implementa o contrato gRPC compartilhado ZoneCollector (4.3), consumido pelo gateway.
 * Lê do estado concorrente da zona; o SetThreshold exige confirmação de primário + réplica.
 */
public class ZoneCollectorServico extends ZoneCollectorGrpc.ZoneCollectorImplBase {

    private static final Logger log = LoggerFactory.getLogger(ZoneCollectorServico.class);

    private final EstadoZona estado;
    private final GerenciadorPapel gerenciador;
    private final ClienteReplicacao clienteReplicacao; // pode ser null (ex.: instância réplica)

    public ZoneCollectorServico(EstadoZona estado, GerenciadorPapel gerenciador,
                                ClienteReplicacao clienteReplicacao) {
        this.estado = estado;
        this.gerenciador = gerenciador;
        this.clienteReplicacao = clienteReplicacao;
    }

    @Override
    public void getZoneStatus(ZoneRequest req, StreamObserver<ZoneStatus> resp) {
        ZoneStatus.Builder b = ZoneStatus.newBuilder()
                .setZonaId(estado.getZonaId())
                .setPapelNoMomento(gerenciador.papel().name())
                .setAtualizadoEm(Instant.now().toString());

        for (Metrica m : estado.snapshot()) {
            b.addMetricas(Metric.newBuilder()
                    .setTipo(m.tipo)
                    .setValor(m.valor)
                    .setUnidade(m.unidade == null ? "" : m.unidade)
                    .setTimestamp(m.timestamp == null ? "" : m.timestamp)
                    .build());
        }

        resp.onNext(b.build());
        resp.onCompleted();
    }

    @Override
    public void getZoneHistory(HistoryRequest req, StreamObserver<HistoryResponse> resp) {
        Instant de = parseOpt(req.getDe());
        Instant ate = parseOpt(req.getAte());

        HistoryResponse.Builder b = HistoryResponse.newBuilder();
        for (var p : estado.historico(req.getTipo(), de, ate)) {
            b.addPontos(com.citypulse.grpc.DataPoint.newBuilder()
                    .setTimestamp(p.instante.toString())
                    .setValor(p.valor)
                    .build());
        }

        resp.onNext(b.build());
        resp.onCompleted();
    }

    @Override
    public void setThreshold(ThresholdRequest req, StreamObserver<ThresholdAck> resp) {
        boolean acimaDispara = !"vagas_estacionamento".equals(req.getTipo());

        // 1) aplica no primário (esta instância)
        estado.setLimite(req.getTipo(), new Limite(req.getLimite(), req.getNivel(), acimaDispara));
        boolean confirmadoPrimario = true;

        // 2) aplica na réplica de forma síncrona — consistência forte
        boolean confirmadoReplica = false;
        if (clienteReplicacao != null) {
            confirmadoReplica =
                    clienteReplicacao.aplicarLimiteNaReplica(req.getTipo(), req.getLimite(), req.getNivel());
        } else {
            log.warn("[{}] SetThreshold sem cliente de replicação — não há réplica para confirmar",
                    estado.getZonaId());
        }

        boolean sucesso = confirmadoPrimario && confirmadoReplica;
        log.info("[{}] SetThreshold {}={} ({}) → sucesso={} primario={} replica={}",
                estado.getZonaId(), req.getTipo(), req.getLimite(), req.getNivel(),
                sucesso, confirmadoPrimario, confirmadoReplica);

        resp.onNext(ThresholdAck.newBuilder()
                .setSucesso(sucesso)
                .setConfirmadoPrimario(confirmadoPrimario)
                .setConfirmadoReplica(confirmadoReplica)
                .build());
        resp.onCompleted();
    }

    private Instant parseOpt(String ts) {
        if (ts == null || ts.isEmpty()) return null;
        try {
            return Instant.parse(ts);
        } catch (Exception e) {
            log.debug("[{}] timestamp inválido ignorado: {}", estado.getZonaId(), ts);
            return null;
        }
    }
}
