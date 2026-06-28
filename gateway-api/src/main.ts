import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MqttService } from './mqtt/mqtt.service';
import { EventsGateway } from './websocket/events.gateway';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: '*' });

  // Conecta MQTT ao WebSocket (feito aqui para evitar dependência circular entre módulos)
  const mqttService = app.get(MqttService);
  const eventsGateway = app.get(EventsGateway);
  mqttService.setEventsGateway(eventsGateway);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`\nCityPulse Gateway rodando em http://localhost:${port}`);
  console.log(`   REST: http://localhost:${port}/api/zonas`);
  console.log(`   WS:   ws://localhost:${port}\n`);
}

bootstrap();
