import amqp from 'amqplib';
import { config } from './config';
import { TarefaManutencao, TipoTarefa } from './types';
import { reconciliacao, downsampling, relatorio } from './handlers';

const handlers: Record<TipoTarefa, (t: TarefaManutencao) => Promise<void>> = {
  reconciliacao,
  downsampling,
  relatorio,
};

async function processar(tarefa: TarefaManutencao): Promise<void> {
  const handler = handlers[tarefa.tipo];
  if (!handler) {
    console.warn(`[worker] tipo de tarefa desconhecido: ${tarefa.tipo}`);
    return;
  }
  await handler(tarefa);
}

async function conectarComRetry(tentativas = 30, intervaloMs = 2000): Promise<amqp.ChannelModel> {
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await amqp.connect(config.rabbitmqUrl);
    } catch (err) {
      console.warn(`[worker] RabbitMQ indisponível (tentativa ${i}/${tentativas}), aguardando…`);
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
  throw new Error(`[worker] não foi possível conectar ao RabbitMQ após ${tentativas} tentativas`);
}

async function main(): Promise<void> {
  const conn = await conectarComRetry();
  const channel = await conn.createChannel();
  await channel.assertQueue(config.fila, { durable: true });
  await channel.prefetch(1);

  console.log(`[worker] conectado a ${config.rabbitmqUrl}`);
  console.log(`[worker] aguardando tarefas na fila "${config.fila}"...`);

  await channel.consume(config.fila, async (msg) => {
    if (!msg) return;
    try {
      const tarefa = JSON.parse(msg.content.toString()) as TarefaManutencao;
      await processar(tarefa);
      channel.ack(msg);
    } catch (err) {
      console.error('[worker] erro ao processar tarefa:', err);
      channel.nack(msg, false, false);
    }
  });

  const encerrar = async () => {
    console.log('\n[worker] encerrando...');
    await channel.close();
    await conn.close();
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

main().catch((err) => {
  console.error('[worker] falha fatal:', err);
  process.exit(1);
});
