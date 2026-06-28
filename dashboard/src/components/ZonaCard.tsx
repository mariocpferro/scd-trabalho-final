'use client';

import { useStatusPoll } from '@/lib/useStatusPoll';
import { formatarHora, rotuloMetrica, rotuloUnidade } from '@/lib/format';
import { PapelBadge } from './PapelBadge';
import type { Zona } from '@/lib/types';

export function ZonaCard({ zona }: { zona: Zona }) {
  const { status, erro } = useStatusPoll(zona.id);

  return (
    <div className="card">
      <div className="card-topo">
        <strong>{zona.nome}</strong>
        <PapelBadge papel={status?.papel_no_momento} />
      </div>

      {erro && !status ? (
        <p className="muted">sem conexão…</p>
      ) : !status ? (
        <p className="muted">carregando…</p>
      ) : (
        <>
          <ul className="metricas">
            {status.metricas.map((m) => (
              <li key={m.tipo}>
                <span className="muted">{rotuloMetrica(m.tipo)}</span>
                <span className="valor">
                  {m.valor} <small>{rotuloUnidade(m.unidade)}</small>
                </span>
              </li>
            ))}
          </ul>
          <p className="atualizado">atualizado às {formatarHora(status.atualizado_em)}</p>
        </>
      )}
    </div>
  );
}
