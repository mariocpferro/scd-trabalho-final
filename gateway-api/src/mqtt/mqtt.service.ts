import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { AlertasService } from '../alertas/alertas.service';
import { EventsGateway } from '../websocket/events.gateway';

@Injectable()
export class MqttService implements OnModuleInit {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;
  private eventsGateway: EventsGateway | null = null;

  constructor(private readonly alertasService: AlertasService) {}

  // Injetado após inicialização para evitar dependência circular
  setEventsGateway(gw: EventsGateway) {
    this.eventsGateway = gw;
  }

  onModuleInit() {
    const url = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    this.client = mqtt.connect(url);

    this.client.on('connect', () => {
      this.logger.log(`Conectado ao broker MQTT: ${url}`);
      this.client.subscribe('citypulse/alertas/+', (err) => {
        if (err) this.logger.error(`Erro ao subscrever: ${err.message}`);
        else this.logger.log('Subscrito em citypulse/alertas/+');
      });
    });

    this.client.on('message', (topic, payload) => {
      try {
        const zonaId = topic.split('/')[2];
        const alerta = JSON.parse(payload.toString());
        this.alertasService.add(alerta);
        this.eventsGateway?.emitAlerta(zonaId, alerta);
      } catch (e: any) {
        this.logger.warn(`Mensagem MQTT inválida em ${topic}: ${e.message}`);
      }
    });

    this.client.on('error', (err) => {
      this.logger.warn(`MQTT erro: ${err.message}`);
    });
  }
}
