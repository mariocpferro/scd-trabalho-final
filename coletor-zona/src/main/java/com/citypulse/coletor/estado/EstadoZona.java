package com.citypulse.coletor.estado;

import com.citypulse.coletor.modelo.DataPoint;
import com.citypulse.coletor.modelo.Limite;
import com.citypulse.coletor.modelo.Metrica;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * Estado compartilhado da zona, acessado concorrentemente por:
 * <ul>
 *   <li>várias threads de ingestão MQTT (escrita),</li>
 *   <li>threads do servidor gRPC (leitura de status/histórico),</li>
 *   <li>threads de processamento em segundo plano (agregação/avaliação),</li>
 *   <li>a thread de replicação (escrita, no caso da réplica).</li>
 * </ul>
 * Por isso todas as estruturas são thread-safe (ConcurrentHashMap / ConcurrentLinkedDeque)
 * e as operações compostas usam métodos atômicos do mapa.
 */
public class EstadoZona {

    /** Limite máximo de pontos guardados por tipo (evita crescer indefinidamente). */
    private static final int MAX_HISTORICO = 5_000;

    private final String zonaId;

    private final Map<String, Metrica> atual = new ConcurrentHashMap<>();
    private final Map<String, ConcurrentLinkedDeque<DataPoint>> historico = new ConcurrentHashMap<>();
    private final Map<String, Limite> limites = new ConcurrentHashMap<>();

    public EstadoZona(String zonaId) {
        this.zonaId = zonaId;
        aplicarLimitesPadrao();
    }

    /** Limites iniciais (configuráveis em tempo de execução via SetThreshold). */
    private void aplicarLimitesPadrao() {
        // dispara quando o valor passa ACIMA do limite
        limites.put("qualidade_ar", new Limite(300, "critical", true));
        limites.put("temperatura", new Limite(40, "critical", true));
        limites.put("consumo_energia", new Limite(900, "critical", true));
        // vagas livres: dispara quando fica ABAIXO do limite (estacionamento quase cheio)
        limites.put("vagas_estacionamento", new Limite(5, "critical", false));
    }

    public String getZonaId() {
        return zonaId;
    }

    /**
     * Registra uma leitura já sanitizada: atualiza o valor atual e acrescenta ao histórico.
     * Thread-safe — pode ser chamado por múltiplas threads de ingestão simultaneamente.
     */
    public void registrarLeitura(String tipo, double valor, String unidade, Instant instante) {
        atual.put(tipo, new Metrica(tipo, valor, unidade, instante.toString()));

        ConcurrentLinkedDeque<DataPoint> serie =
                historico.computeIfAbsent(tipo, k -> new ConcurrentLinkedDeque<>());
        serie.addLast(new DataPoint(instante, valor));

        // Poda o excesso de forma segura (apenas reduz; concorrência tolerável aqui).
        while (serie.size() > MAX_HISTORICO) {
            serie.pollFirst();
        }
    }

    /** Snapshot consistente das métricas atuais (cópia, não expõe o mapa interno). */
    public Collection<Metrica> snapshot() {
        return new ArrayList<>(atual.values());
    }

    public Metrica metricaAtual(String tipo) {
        return atual.get(tipo);
    }

    /** Histórico de um tipo filtrado por intervalo [de, ate] (limites opcionais). */
    public List<DataPoint> historico(String tipo, Instant de, Instant ate) {
        ConcurrentLinkedDeque<DataPoint> serie = historico.get(tipo);
        List<DataPoint> resultado = new ArrayList<>();
        if (serie == null) return resultado;
        for (DataPoint p : serie) {
            if (de != null && p.instante.isBefore(de)) continue;
            if (ate != null && p.instante.isAfter(ate)) continue;
            resultado.add(p);
        }
        return resultado;
    }

    public Limite getLimite(String tipo) {
        return limites.get(tipo);
    }

    public void setLimite(String tipo, Limite limite) {
        limites.put(tipo, limite);
    }

    public Map<String, Limite> limites() {
        return limites;
    }
}
