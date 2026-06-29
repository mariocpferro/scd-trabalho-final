import 'reflect-metadata';

// Previne qualquer conexão real com RabbitMQ
jest.mock('amqplib', () => ({
  connect: jest.fn().mockRejectedValue(new Error('no rabbitmq in tests')),
}));

import { RabbitMqService } from './rabbitmq.service';

describe('RabbitMqService', () => {
  let service: RabbitMqService;

  beforeEach(() => {
    service = new RabbitMqService();
    // Deixa o channel null (estado pós-falha de conexão) por padrão
    (service as any).channel = null;
  });

  it('descarta mensagem silenciosamente quando channel é null', async () => {
    await expect(service.publish({ tipo: 'teste' })).resolves.toBeUndefined();
  });

  it('envia mensagem para a fila quando channel está disponível', async () => {
    const sendToQueue = jest.fn();
    (service as any).channel = { sendToQueue };

    await service.publish({ tipo: 'reconciliacao', zona_id: 'centro' });

    expect(sendToQueue).toHaveBeenCalledWith(
      'citypulse.manutencao',
      expect.any(Buffer),
      { persistent: true },
    );

    const bufferEnviado: Buffer = sendToQueue.mock.calls[0][1];
    expect(JSON.parse(bufferEnviado.toString())).toEqual({
      tipo: 'reconciliacao',
      zona_id: 'centro',
    });
  });

  it('serializa mensagens arbitrárias como JSON', async () => {
    const sendToQueue = jest.fn();
    (service as any).channel = { sendToQueue };
    const msg = { x: 1, y: [2, 3] };

    await service.publish(msg);

    const enviado = JSON.parse(sendToQueue.mock.calls[0][1].toString());
    expect(enviado).toEqual(msg);
  });
});
