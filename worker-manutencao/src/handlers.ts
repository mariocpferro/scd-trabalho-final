import { TarefaManutencao } from './types';

/**
 * Reconciliação entre o coletor primário e a réplica de uma zona:
 * compara o estado das duas e alinha divergências.
 */
export async function reconciliacao(tarefa: TarefaManutencao): Promise<void> {
  console.log(`[reconciliacao] zona=${tarefa.zona_id} agendado_em=${tarefa.agendado_em}`);
}

/**
 * Downsampling: reduz a resolução do histórico antigo de uma zona
 * (ex.: agrega leituras minuto-a-minuto em médias horárias).
 */
export async function downsampling(tarefa: TarefaManutencao): Promise<void> {
  console.log(`[downsampling] zona=${tarefa.zona_id} agendado_em=${tarefa.agendado_em}`);
}

/**
 * Geração de relatório periódico do estado de uma zona.
 */
export async function relatorio(tarefa: TarefaManutencao): Promise<void> {
  console.log(`[relatorio] zona=${tarefa.zona_id} agendado_em=${tarefa.agendado_em}`);
}
