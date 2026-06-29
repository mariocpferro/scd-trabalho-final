package com.citypulse.coletor.processamento;

import com.citypulse.coletor.estado.EstadoZona;
import com.citypulse.coletor.modelo.Limite;
import com.citypulse.coletor.mqtt.PublicadorAlertas;
import com.citypulse.coletor.replicacao.GerenciadorPapel;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Avalia cada leitura contra o limite configurado do tipo e publica alerta quando violado.
 * Só o PRIMARIO publica alertas (a réplica apenas mantém estado).
 *
 * <p>Aplica um cooldown por tipo para não inundar o tópico de alertas a cada leitura.
 */
public class AvaliadorLimites {

    private static final long COOLDOWN_MS = 30_000;

    private final EstadoZona estado;
    private final PublicadorAlertas publicador;
    private final GerenciadorPapel gerenciador;
    private final Map<String, Long> ultimoAlerta = new ConcurrentHashMap<>();

    public AvaliadorLimites(EstadoZona estado, PublicadorAlertas publicador, GerenciadorPapel gerenciador) {
        this.estado = estado;
        this.publicador = publicador;
        this.gerenciador = gerenciador;
    }

    public void avaliar(String tipo, double valor) {
        // Só o PRIMARIO publica alertas; a réplica apenas mantém estado (evita alerta duplicado).
        if (!gerenciador.ehPrimario()) {
            return;
        }

        Limite limite = estado.getLimite(tipo);
        if (limite == null || !limite.violado(valor)) {
            return;
        }

        long agora = System.currentTimeMillis();
        Long ultimo = ultimoAlerta.get(tipo);
        if (ultimo != null && (agora - ultimo) < COOLDOWN_MS) {
            return; // ainda em cooldown
        }
        ultimoAlerta.put(tipo, agora);

        String mensagem = montarMensagem(tipo, valor, limite);
        publicador.publicar(tipo, limite.nivel, valor, limite.limite, mensagem);
    }

    private String montarMensagem(String tipo, double valor, Limite limite) {
        String direcao = limite.acimaDispara ? "acima do limite" : "abaixo do limite";
        return String.format("Zona %s: %s em %.2f (%s %.2f, nível %s)",
                estado.getZonaId(), tipo, valor, direcao, limite.limite, limite.nivel);
    }
}
