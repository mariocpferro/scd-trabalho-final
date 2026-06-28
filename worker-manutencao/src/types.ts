export type TipoTarefa = 'reconciliacao' | 'downsampling' | 'relatorio';

export interface TarefaManutencao {
  tipo: TipoTarefa;
  zona_id: string;
  agendado_em: string;
}
