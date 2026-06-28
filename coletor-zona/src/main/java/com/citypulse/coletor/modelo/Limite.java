package com.citypulse.coletor.modelo;

/**
 * Limite configurado para disparo de alerta de um tipo de métrica.
 *
 * <p>{@code acimaDispara} indica a direção da comparação:
 * <ul>
 *   <li>true  → dispara quando valor &gt; limite (ex.: qualidade do ar, temperatura, energia);</li>
 *   <li>false → dispara quando valor &lt; limite (ex.: vagas livres — poucas vagas é o problema).</li>
 * </ul>
 */
public final class Limite {
    public final double limite;
    public final String nivel;        // "warning" ou "critical"
    public final boolean acimaDispara;

    public Limite(double limite, String nivel, boolean acimaDispara) {
        this.limite = limite;
        this.nivel = nivel;
        this.acimaDispara = acimaDispara;
    }

    /** Retorna true se o valor viola este limite. */
    public boolean violado(double valor) {
        return acimaDispara ? valor > limite : valor < limite;
    }
}
