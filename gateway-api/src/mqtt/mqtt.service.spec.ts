import 'reflect-metadata';

jest.mock('mqtt', () => ({ connect: jest.fn() }));

import * as mqtt from 'mqtt';
import { MqttService } from './mqtt.service';
import { AlertasService } from '../alertas/alertas.service';
import { EventsGateway } from '../websocket/events.gateway';

const buildMqttClient = () => {
  const handlers: Record<string, any> = {};
  return {
    on: jest.fn((event: string, handler: any) => { handlers[event] = handler; }),
    subscribe: jest.fn(),
    _trigger: (event: string, ...args: any[]) => handlers[event]?.(...args),
  };
};

describe('MqttService', () => {
  let service: MqttService;
  let alertasService: AlertasService;
  let eventsGateway: Partial<EventsGateway>;
  let mqttClient: ReturnType<typeof buildMqttClient>;

  beforeEach(() => {
    alertasService = new AlertasService();
    eventsGateway = { emitAlerta: jest.fn() };

    mqttClient = buildMqttClient();
    (mqtt.connect as jest.Mock).mockReturnValue(mqttClient);

    service = new MqttService(alertasService);
    service.setEventsGateway(eventsGateway as EventsGateway);
    service.onModuleInit();
  });

  describe('ao receber mensagem MQTT', () => {
    const alerta = {
      zona_id: 'centro',
      tipo: 'qualidade_ar',
      nivel: 'critico',
      valor: 450,
      limite: 200,
      mensagem: 'AQI elevado',
      timestamp: '2026-06-29T15:00:01Z',
    };

    it('adiciona alerta no AlertasService', () => {
      jest.spyOn(alertasService, 'add');

      mqttClient._trigger(
        'message',
        'citypulse/alertas/centro',
        Buffer.from(JSON.stringify(alerta)),
      );

      expect(alertasService.add).toHaveBeenCalledWith(alerta);
    });

    it('emite alerta via WebSocket com a zona correta', () => {
      mqttClient._trigger(
        'message',
        'citypulse/alertas/norte',
        Buffer.from(JSON.stringify({ ...alerta, zona_id: 'norte' })),
      );

      expect(eventsGateway.emitAlerta).toHaveBeenCalledWith(
        'norte',
        expect.objectContaining({ zona_id: 'norte' }),
      );
    });

    it('ignora mensagem com JSON inválido sem lançar exceção', () => {
      expect(() =>
        mqttClient._trigger('message', 'citypulse/alertas/sul', Buffer.from('não é json')),
      ).not.toThrow();

      expect(eventsGateway.emitAlerta).not.toHaveBeenCalled();
    });
  });

  it('subscribe no tópico correto ao conectar', () => {
    mqttClient._trigger('connect');
    expect(mqttClient.subscribe).toHaveBeenCalledWith(
      'citypulse/alertas/+',
      expect.any(Function),
    );
  });
});
