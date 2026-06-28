'use client';

import { useEffect, useState } from 'react';
import { listarZonas, setLimite } from '@/lib/api';
import { rotuloMetrica } from '@/lib/format';
import type { ThresholdAck, Zona } from '@/lib/types';

const TIPOS = ['temperatura', 'qualidade_ar', 'vagas_estacionamento', 'consumo_energia'];
const NIVEIS = ['warning', 'critical'];

export default function LimitesPage() {
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [zona, setZona] = useState('centro');
  const [tipo, setTipo] = useState('qualidade_ar');
  const [nivel, setNivel] = useState('critical');
  const [limite, setLimiteValor] = useState(300);

  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ThresholdAck | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarZonas().then(setZonas).catch((e) => setErro(String(e)));
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setResultado(null);
    setErro(null);
    try {
      const ack = await setLimite(zona, tipo, Number(limite), nivel);
      setResultado(ack);
    } catch (err) {
      setErro(String(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <h2>Configuração de limites</h2>
      <p className="muted">
        A escrita só é confirmada após o primário <strong>e</strong> a réplica confirmarem
        (consistência forte).
      </p>

      <form className="card form-limites" onSubmit={enviar}>
        <label>
          Zona
          <select value={zona} onChange={(e) => setZona(e.target.value)}>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nome}
              </option>
            ))}
          </select>
        </label>

        <label>
          Métrica
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {rotuloMetrica(t)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Nível
          <select value={nivel} onChange={(e) => setNivel(e.target.value)}>
            {NIVEIS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label>
          Limite
          <input
            type="number"
            step="any"
            value={limite}
            onChange={(e) => setLimiteValor(Number(e.target.value))}
          />
        </label>

        <button type="submit" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Salvar limite'}
        </button>
      </form>

      {erro && <p style={{ color: 'var(--critical)' }}>Erro: {erro}</p>}

      {resultado && (
        <div className={`card ack ${resultado.sucesso ? 'ack-ok' : 'ack-falha'}`}>
          <strong>{resultado.sucesso ? '✓ Limite configurado' : '✗ Falha ao configurar'}</strong>
          <ul>
            <li>
              Primário:{' '}
              <span className={resultado.confirmado_primario ? 'ok' : 'falha'}>
                {resultado.confirmado_primario ? 'confirmado' : 'não confirmado'}
              </span>
            </li>
            <li>
              Réplica:{' '}
              <span className={resultado.confirmado_replica ? 'ok' : 'falha'}>
                {resultado.confirmado_replica ? 'confirmado' : 'não confirmado'}
              </span>
            </li>
          </ul>
        </div>
      )}
    </>
  );
}
