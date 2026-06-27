import { Module } from '@nestjs/common';
import { GrpcModule } from './grpc/grpc.module';
import { AlertasModule } from './alertas/alertas.module';
import { ZonasModule } from './zonas/zonas.module';
import { RabbitMqModule } from './rabbitmq/rabbitmq.module';
import { MqttModule } from './mqtt/mqtt.module';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [GrpcModule, AlertasModule, ZonasModule, RabbitMqModule, MqttModule, WebsocketModule],
})
export class AppModule {}
