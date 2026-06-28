import { config } from './config';
import { lerSnapshot, salvarSnapshot, salvarRelatorio } from './store';
import { LeituraHistorica, Metrica, TarefaManutencao } from './types';

/**
 * Reconciliação entre o coletor primário e a réplica de uma zona:
 * compara as métricas das duas e alinha a réplica ao primário,
 * que é a fonte autoritativa do estado da zona.
 */
export async function reconciliacao(tarefa: TarefaManutencao): Promise<void> {
  const zona = tarefa.zona_id;
  const primario = lerSnapshot(zona, 'primario');
  const replica = lerSnapshot(zona, 'replica');

  if (!primario) {
    console.warn(`[reconciliacao] zona=${zona}: snapshot do primário ausente, nada a fazer`);
    return;
  }
  if (!replica) {
    console.warn(`[reconciliacao] zona=${zona}: réplica ausente, criando a partir do primário`);
    salvarSnapshot({ ...primario, papel: 'replica' });
    return;
  }

  const porTipo = new Map<string, Metrica>();
  replica.metricas.forEach((m) => porTipo.set(m.tipo, m));

  let divergencias = 0;
  for (const m of primario.metricas) {
    const atual = porTipo.get(m.tipo);
    if (!atual || atual.valor !== m.valor || atual.timestamp !== m.timestamp) {
      divergencias++;
    }
  }

  const reconciliada = {
    ...replica,
    metricas: primario.metricas,
    historico: primario.historico,
    atualizado_em: primario.atualizado_em,
  };
  salvarSnapshot(reconciliada);

  console.log(`[reconciliacao] zona=${zona}: ${divergencias} divergência(s) corrigida(s) na réplica`);
}

/**
 * Downsampling: agrega leituras antigas do histórico em médias horárias,
 * reduzindo o volume de dados mantido sem perder a tendência.
 */
export async function downsampling(tarefa: TarefaManutencao): Promise<void> {
  const zona = tarefa.zona_id;
  const snapshot = lerSnapshot(zona, 'primario');
  if (!snapshot) {
    console.warn(`[downsampling] zona=${zona}: snapshot do primário ausente, nada a fazer`);
    return;
  }

  const corte = Date.now() - config.downsamplingIdadeMin * 60_000;
  const antigas: LeituraHistorica[] = [];
  const recentes: LeituraHistorica[] = [];
  for (const l of snapshot.historico) {
    (new Date(l.timestamp).getTime() < corte ? antigas : recentes).push(l);
  }

  if (antigas.length === 0) {
    console.log(`[downsampling] zona=${zona}: nenhuma leitura antiga para agregar`);
    return;
  }

  // Agrupa as antigas por (tipo, hora) e calcula a média.
  const grupos = new Map<string, { tipo: string; hora: string; soma: number; n: number }>();
  for (const l of antigas) {
    const hora = l.timestamp.slice(0, 13); // YYYY-MM-DDTHH
    const chave = `${l.tipo}|${hora}`;
    const g = grupos.get(chave) || { tipo: l.tipo, hora, soma: 0, n: 0 };
    g.soma += l.valor;
    g.n += 1;
    grupos.set(chave, g);
  }

  const agregadas: LeituraHistorica[] = [...grupos.values()].map((g) => ({
    tipo: g.tipo,
    valor: +(g.soma / g.n).toFixed(2),
    timestamp: `${g.hora}:00:00Z`,
  }));

  snapshot.historico = [...agregadas, ...recentes];
  salvarSnapshot(snapshot);

  console.log(
    `[downsampling] zona=${zona}: ${antigas.length} leitura(s) antiga(s) agregada(s) em ${agregadas.length} ponto(s) horário(s)`,
  );
}

/**
 * Geração de relatório periódico do estado de uma zona:
 * estatísticas por métrica a partir do histórico, gravadas em arquivo.
 */
export async function relatorio(tarefa: TarefaManutencao): Promise<void> {
  const zona = tarefa.zona_id;
  const snapshot = lerSnapshot(zona, 'primario');
  if (!snapshot) {
    console.warn(`[relatorio] zona=${zona}: snapshot do primário ausente, nada a fazer`);
    return;
  }

  const porTipo = new Map<string, number[]>();
  for (const l of snapshot.historico) {
    const arr = porTipo.get(l.tipo) || [];
    arr.push(l.valor);
    porTipo.set(l.tipo, arr);
  }

  const metricas = [...porTipo.entries()].map(([tipo, valores]) => ({
    tipo,
    amostras: valores.length,
    min: Math.min(...valores),
    max: Math.max(...valores),
    media: +(valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2),
  }));

  const relatorioFinal = {
    zona_id: zona,
    gerado_em: new Date().toISOString(),
    atualizado_em: snapshot.atualizado_em,
    metricas,
  };

  const caminho = salvarRelatorio(zona, relatorioFinal);
  console.log(`[relatorio] zona=${zona}: relatório com ${metricas.length} métrica(s) salvo em ${caminho}`);
}
