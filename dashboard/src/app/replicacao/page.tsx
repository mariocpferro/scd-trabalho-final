'use client';

import { useEffect, useState } from 'react';
import { listarZonas } from '@/lib/api';
import { ReplicacaoLinha } from '@/components/ReplicacaoLinha';
import type { Zona } from '@/lib/types';

export default function ReplicacaoPage() {
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarZonas()
      .then(setZonas)
      .catch((e) => setErro(String(e)));
  }, []);

  if (erro) {
    return <p style={{ color: 'var(--critical)' }}>Erro ao conectar no gateway: {erro}</p>;
  }

  return (
    <>
      <h2>Replicação por zona</h2>
      <p className="muted">
        Papel atual do coletor de cada zona. Ao derrubar um primário, a réplica assume e
        este painel reflete a mudança automaticamente.
      </p>
      <div className="repl-lista">
        {zonas.map((z) => (
          <ReplicacaoLinha key={z.id} zona={z} />
        ))}
      </div>
    </>
  );
}
