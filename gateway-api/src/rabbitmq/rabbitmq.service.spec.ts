import 'reflect-metadata';
import { RabbitMqService } from './rabbitmq.service';

describe('RabbitMqService', () => {
  let service: RabbitMqService;

  beforeEach(() => {
    service = new RabbitMqService();
    // Impede conexão real com RabbitMQ durante os testes
    jest.spyOn(service as any, 'connect').mockResolvedValue(undefined);
  });

  it('descarta mensagem silenciosamente quando channel é null', async () => {
    (service as any).channel = null;
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
});
