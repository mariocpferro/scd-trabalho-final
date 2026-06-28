'use client';

import { useEffect, useState } from 'react';
import { getHistorico, listarZonas } from '@/lib/api';
import { LineChart } from '@/components/LineChart';
import { rotuloMetrica } from '@/lib/format';
import type { DataPoint, Zona } from '@/lib/types';

const TIPOS = ['temperatura', 'qualidade_ar', 'vagas_estacionamento', 'consumo_energia'];

export default function HistoricoPage() {
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [zona, setZona] = useState('centro');
  const [tipo, setTipo] = useState('temperatura');
  const [pontos, setPontos] = useState<DataPoint[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarZonas().then(setZonas).catch((e) => setErro(String(e)));
  }, []);

  useEffect(() => {
    getHistorico(zona, tipo)
      .then((r) => {
        setPontos(r.pontos);
        setErro(null);
      })
      .catch((e) => setErro(String(e)));
  }, [zona, tipo]);

  return (
    <>
      <h2>Histórico</h2>
      <div className="filtros">
        <label>
          Zona{' '}
          <select value={zona} onChange={(e) => setZona(e.target.value)}>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Métrica{' '}
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {rotuloMetrica(t)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {erro ? (
        <p style={{ color: 'var(--critical)' }}>Erro: {erro}</p>
      ) : (
        <div className="card chart-card">
          <LineChart pontos={pontos} />
        </div>
      )}
    </>
  );
}
