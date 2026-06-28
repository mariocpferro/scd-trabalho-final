'use client';

import { useEffect, useState } from 'react';
import { getAlertas, listarZonas } from './api';
import { getSocket, subscribeZona } from './socket';
import type { Alerta, WsEvento } from './types';

/**
 * Mantém a lista de alertas: carga inicial via REST + novos alertas
 * empurrados em tempo real pelo gateway via WebSocket (Socket.IO).
 */
export function useAlertas(): { alertas: Alerta[]; conectado: boolean } {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    getAlertas().then(setAlertas).catch(() => undefined);

    const socket = getSocket();

    const aoConectar = () => {
      setConectado(true);
      listarZonas()
        .then((zonas) => zonas.forEach((z) => subscribeZona(z.id)))
        .catch(() => undefined);
    };
    const aoDesconectar = () => setConectado(false);

    const aoReceber = (payload: WsEvento) => {
      if (payload?.evento === 'alerta') {
        setAlertas((atual) => [payload.dados, ...atual].slice(0, 200));
      }
    };

    if (socket.connected) aoConectar();
    socket.on('connect', aoConectar);
    socket.on('disconnect', aoDesconectar);
    socket.on('message', aoReceber);

    return () => {
      socket.off('connect', aoConectar);
      socket.off('disconnect', aoDesconectar);
      socket.off('message', aoReceber);
    };
  }, []);

  return { alertas, conectado };
}
