import 'reflect-metadata';
import { EventsGateway } from './events.gateway';

const makeSocket = (id = 'socket-1') => ({
  id,
  join: jest.fn(),
});

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let mockTo: jest.Mock;
  let mockEmit: jest.Mock;

  beforeEach(() => {
    gateway = new EventsGateway();
    mockEmit = jest.fn();
    mockTo = jest.fn(() => ({ emit: mockEmit }));
    (gateway as any).server = { to: mockTo };
  });

  describe('handleSubscribe', () => {
    it('faz o cliente entrar na sala da zona', () => {
      const client = makeSocket();
      gateway.handleSubscribe({ zona_id: 'centro' }, client as any);
      expect(client.join).toHaveBeenCalledWith('zona:centro');
    });
  });

  describe('handleMessage', () => {
    it('faz o cliente entrar na sala quando acao=subscribe', () => {
      const client = makeSocket();
      gateway.handleMessage({ acao: 'subscribe', zona_id: 'norte' }, client as any);
      expect(client.join).toHaveBeenCalledWith('zona:norte');
    });

    it('ignora acao desconhecida', () => {
      const client = makeSocket();
      gateway.handleMessage({ acao: 'ping', zona_id: 'norte' }, client as any);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('ignora mensagem sem zona_id mesmo com acao=subscribe', () => {
      const client = makeSocket();
      gateway.handleMessage({ acao: 'subscribe', zona_id: '' }, client as any);
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('emitAlerta', () => {
    it('emite evento "message" com payload correto para a sala da zona', () => {
      const dados = { nivel: 'critico', valor: 450 };
      gateway.emitAlerta('centro', dados);

      expect(mockTo).toHaveBeenCalledWith('zona:centro');
      expect(mockEmit).toHaveBeenCalledWith('message', { evento: 'alerta', dados });
    });
  });

  describe('emitStatusUpdate', () => {
    it('emite evento "message" com payload correto para a sala da zona', () => {
      const dados = { sensores: 3, online: 2 };
      gateway.emitStatusUpdate('sul', dados);

      expect(mockTo).toHaveBeenCalledWith('zona:sul');
      expect(mockEmit).toHaveBeenCalledWith('message', { evento: 'status_update', dados });
    });
  });
});
