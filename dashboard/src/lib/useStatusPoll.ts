'use client';

import { useEffect, useRef, useState } from 'react';
import { getStatus } from './api';
import type { ZoneStatus } from './types';

interface PollState {
  status: ZoneStatus | null;
  erro: string | null;
}

/**
 * Mantém o status de uma zona atualizado via polling REST do gateway.
 * O gateway não empurra `status_update` por WebSocket, então a leitura
 * em tempo real do estado da zona é feita por polling periódico.
 */
export function useStatusPoll(zonaId: string, intervaloMs = 4000): PollState {
  const [estado, setEstado] = useState<PollState>({ status: null, erro: null });
  const ativo = useRef(true);

  useEffect(() => {
    ativo.current = true;

    const buscar = async () => {
      try {
        const status = await getStatus(zonaId);
        if (ativo.current) setEstado({ status, erro: null });
      } catch (e) {
        if (ativo.current) setEstado((s) => ({ status: s.status, erro: String(e) }));
      }
    };

    buscar();
    const id = setInterval(buscar, intervaloMs);
    return () => {
      ativo.current = false;
      clearInterval(id);
    };
  }, [zonaId, intervaloMs]);

  return estado;
}
