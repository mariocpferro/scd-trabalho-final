export type TipoTarefa = 'reconciliacao' | 'downsampling' | 'relatorio';

export interface TarefaManutencao {
  tipo: TipoTarefa;
  zona_id: string;
  agendado_em: string;
}

export type Papel = 'primario' | 'replica';

export interface Metrica {
  tipo: string;
  valor: number;
  unidade: string;
  timestamp: string;
}

export interface LeituraHistorica {
  tipo: string;
  valor: number;
  timestamp: string;
}

/** Estado persistido de uma zona, mantido por um coletor (primário ou réplica). */
export interface SnapshotZona {
  zona_id: string;
  papel: Papel;
  metricas: Metrica[];
  historico: LeituraHistorica[];
  atualizado_em: string;
}
