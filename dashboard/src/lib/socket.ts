'use client';

import { io, Socket } from 'socket.io-client';
import { GATEWAY_URL } from './api';

let socket: Socket | null = null;

/** Conexão Socket.IO única e compartilhada com o gateway. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(GATEWAY_URL, { transports: ['websocket'] });
  }
  return socket;
}

/** Inscreve o cliente nos eventos de uma zona (alerta + status_update). */
export function subscribeZona(zonaId: string): void {
  getSocket().emit('subscribe', { zona_id: zonaId });
}
