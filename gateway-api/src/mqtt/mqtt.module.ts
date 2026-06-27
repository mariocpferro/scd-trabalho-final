import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { AlertasModule } from '../alertas/alertas.module';

@Module({
  imports: [AlertasModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
