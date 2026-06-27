import { Module } from '@nestjs/common';
import { ZonasController } from './zonas.controller';
import { GrpcModule } from '../grpc/grpc.module';
import { RabbitMqModule } from '../rabbitmq/rabbitmq.module';

@Module({
  imports: [GrpcModule, RabbitMqModule],
  controllers: [ZonasController],
})
export class ZonasModule {}
