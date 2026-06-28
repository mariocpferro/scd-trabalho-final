export type TipoMetrica =
  | 'temperatura'
  | 'qualidade_ar'
  | 'vagas_estacionamento'
  | 'consumo_energia';

export interface Zona {
  id: string;
  nome: string;
}

export interface Metrica {
  tipo: string;
  valor: number;
  unidade: string;
  timestamp: string;
}

export interface ZoneStatus {
  zona_id: string;
  papel_no_momento: 'PRIMARIO' | 'REPLICA' | string;
  atualizado_em: string;
  metricas: Metrica[];
}

export interface DataPoint {
  timestamp: string;
  valor: number;
}

export interface HistoryResponse {
  pontos: DataPoint[];
}

export interface Alerta {
  zona_id: string;
  tipo: string;
  nivel: string;
  valor: number;
  limite: number;
  mensagem: string;
  timestamp: string;
}

export interface ThresholdAck {
  sucesso: boolean;
  confirmado_primario: boolean;
  confirmado_replica: boolean;
}

/** Eventos empurrados pelo gateway via WebSocket (Socket.IO, evento "message"). */
export type WsEvento =
  | { evento: 'alerta'; dados: Alerta }
  | { evento: 'status_update'; dados: ZoneStatus };
