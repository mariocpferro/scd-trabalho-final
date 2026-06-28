import type {
  Alerta,
  HistoryResponse,
  ThresholdAck,
  Zona,
  ZoneStatus,
} from './types';

export const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';

const API = `${GATEWAY_URL}/api`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`GET ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function listarZonas(): Promise<Zona[]> {
  return getJson<Zona[]>('/zonas');
}

export function getStatus(zonaId: string): Promise<ZoneStatus> {
  return getJson<ZoneStatus>(`/zonas/${zonaId}/status`);
}

export function getHistorico(
  zonaId: string,
  tipo: string,
  de = '',
  ate = '',
): Promise<HistoryResponse> {
  const qs = new URLSearchParams({ tipo, de, ate }).toString();
  return getJson<HistoryResponse>(`/zonas/${zonaId}/historico?${qs}`);
}

export function getAlertas(zona = '', nivel = ''): Promise<Alerta[]> {
  const qs = new URLSearchParams();
  if (zona) qs.set('zona', zona);
  if (nivel) qs.set('nivel', nivel);
  const sufixo = qs.toString() ? `?${qs.toString()}` : '';
  return getJson<Alerta[]>(`/alertas${sufixo}`);
}

export async function setLimite(
  zonaId: string,
  tipo: string,
  limite: number,
  nivel: string,
): Promise<ThresholdAck> {
  const res = await fetch(`${API}/zonas/${zonaId}/limites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, limite, nivel }),
  });
  if (!res.ok) {
    throw new Error(`POST /zonas/${zonaId}/limites → ${res.status}`);
  }
  return res.json() as Promise<ThresholdAck>;
}
