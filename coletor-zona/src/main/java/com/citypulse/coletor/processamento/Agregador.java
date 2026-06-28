package com.citypulse.coletor.processamento;

import com.citypulse.coletor.estado.EstadoZona;
import com.citypulse.coletor.modelo.DataPoint;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Processamento em segundo plano concorrente com a ingestão: a cada minuto calcula a
 * média do último minuto de cada tipo e a registra no log (resumo agregado da zona).
 *
 * <p>Demonstra processamento no servidor rodando em paralelo aos acessos dos clientes:
 * usa um ScheduledExecutorService próprio, lendo o mesmo estado concorrente que as
 * threads de ingestão escrevem.
 */
public class Agregador {

    private static final Logger log = LoggerFactory.getLogger(Agregador.class);
    private static final String[] TIPOS =
            {"temperatura", "qualidade_ar", "vagas_estacionamento", "consumo_energia"};

    private final EstadoZona estado;
    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "agregador");
                t.setDaemon(true);
                return t;
            });

    public Agregador(EstadoZona estado) {
        this.estado = estado;
    }

    public void iniciar() {
        scheduler.scheduleAtFixedRate(this::agregarMinuto, 1, 1, TimeUnit.MINUTES);
        log.info("[{}] agregador iniciado (médias por minuto)", estado.getZonaId());
    }

    private void agregarMinuto() {
        Instant de = Instant.now().minus(1, ChronoUnit.MINUTES);
        for (String tipo : TIPOS) {
            List<DataPoint> pontos = estado.historico(tipo, de, null);
            if (pontos.isEmpty()) continue;
            double media = pontos.stream().mapToDouble(p -> p.valor).average().orElse(Double.NaN);
            log.info("[{}] agregado 1min {} = {} ({} amostras)",
                    estado.getZonaId(), tipo, String.format("%.2f", media), pontos.size());
        }
    }

    public void parar() {
        scheduler.shutdownNow();
    }
}
