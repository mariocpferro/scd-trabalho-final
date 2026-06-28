'use client';

import { useAlertas } from '@/lib/useAlertas';
import { formatarHora, rotuloMetrica } from '@/lib/format';

export default function AlertasPage() {
  const { alertas, conectado } = useAlertas();

  return (
    <>
      <div className="alertas-topo">
        <h2>Alertas</h2>
        <span className={conectado ? 'conn conn-on' : 'conn conn-off'}>
          {conectado ? '● ao vivo' : '○ desconectado'}
        </span>
      </div>

      {alertas.length === 0 ? (
        <p className="muted">Nenhum alerta recente.</p>
      ) : (
        <ul className="alertas-lista">
          {alertas.map((a, i) => (
            <li key={`${a.zona_id}-${a.timestamp}-${i}`} className={`alerta alerta-${a.nivel}`}>
              <span className="alerta-nivel">{a.nivel}</span>
              <div className="alerta-corpo">
                <strong>{a.mensagem}</strong>
                <span className="muted">
                  {a.zona_id} · {rotuloMetrica(a.tipo)} · valor {a.valor} (limite {a.limite})
                </span>
              </div>
              <span className="muted alerta-hora">{formatarHora(a.timestamp)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
