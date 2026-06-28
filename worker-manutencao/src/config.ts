import 'dotenv/config';

export const config = {
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://citypulse:citypulse@localhost:5672',
  fila: process.env.FILA_MANUTENCAO || 'citypulse.manutencao',
};
