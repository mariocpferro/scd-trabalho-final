'use client';

import { useEffect, useState } from 'react';
import { listarZonas } from '@/lib/api';
import { ZonaCard } from '@/components/ZonaCard';
import type { Zona } from '@/lib/types';

export default function HomePage() {
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
      <h2>Status das zonas</h2>
      <div className="grid">
        {zonas.map((z) => (
          <ZonaCard key={z.id} zona={z} />
        ))}
      </div>
    </>
  );
}
