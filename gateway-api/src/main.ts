import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MockColetorService } from './grpc/mock-coletor.service';
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

  if (process.env.GRPC_MODE === 'mock') {
    const mockColetor = app.get(MockColetorService);
    await mockColetor.start();
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`\n🏙  CityPulse Gateway rodando em http://localhost:${port}`);
  console.log(`   REST: http://localhost:${port}/api/zonas`);
  console.log(`   WS:   ws://localhost:${port}\n`);
}

bootstrap();
