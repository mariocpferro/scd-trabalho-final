'use client';

import { useStatusPoll } from '@/lib/useStatusPoll';
import { formatarHora } from '@/lib/format';
import { PapelBadge } from './PapelBadge';
import type { Zona } from '@/lib/types';

export function ReplicacaoLinha({ zona }: { zona: Zona }) {
  const { status, erro } = useStatusPoll(zona.id, 2000);

  return (
    <div className="repl-linha">
      <span className="repl-zona">{zona.nome}</span>
      <PapelBadge papel={status?.papel_no_momento} />
      <span className="muted repl-meta">
        {erro && !status
          ? 'sem conexão'
          : status
            ? `atualizado às ${formatarHora(status.atualizado_em)}`
            : 'carregando…'}
      </span>
    </div>
  );
}
