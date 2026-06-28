package com.citypulse.coletor.processamento;

import com.citypulse.coletor.modelo.Leitura;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Descarta valores fisicamente impossíveis antes de entrarem no estado.
 * Os faixas espelham os outliers que os sensores simulados injetam de propósito
 * (ver sensores-simulados/src/sensors/*.ts).
 */
public class Sanitizador {

    private static final Logger log = LoggerFactory.getLogger(Sanitizador.class);

    /** @return true se a leitura é plausível e deve ser registrada. */
    public boolean valida(Leitura l) {
        boolean ok = switch (l.tipo) {
            case "temperatura"          -> l.valor >= -40 && l.valor <= 60;
            case "qualidade_ar"         -> l.valor >= 0 && l.valor <= 500;
            case "consumo_energia"      -> l.valor >= 0 && l.valor <= 2000;
            case "vagas_estacionamento" -> l.valor >= 0 && l.valor <= totalVagas(l.unidade);
            default                     -> true; // tipo desconhecido: não bloqueia
        };
        if (!ok) {
            log.warn("[{}] leitura descartada (outlier): tipo={} valor={} unidade={}",
                    l.zona_id, l.tipo, l.valor, l.unidade);
        }
        return ok;
    }

    /** Extrai o total da unidade "vagas/NNN"; usa 100 como fallback. */
    private int totalVagas(String unidade) {
        if (unidade != null && unidade.startsWith("vagas/")) {
            try {
                return Integer.parseInt(unidade.substring("vagas/".length()).trim());
            } catch (NumberFormatException ignored) {
                // cai no fallback
            }
        }
        return 100;
    }
}
