import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMqService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMqService.name);
  private channel: amqp.Channel | null = null;

  async onModuleInit() {
    const url = process.env.RABBITMQ_URL || 'amqp://citypulse:citypulse@localhost:5672';
    try {
      const conn = await amqp.connect(url);
      this.channel = await conn.createChannel();
      await this.channel.assertQueue('citypulse.manutencao', { durable: true });
      this.logger.log('Conectado ao RabbitMQ — fila citypulse.manutencao pronta');
    } catch (err) {
      this.logger.warn(`RabbitMQ indisponível: ${err.message}. Mensagens serão descartadas.`);
    }
  }

  async publish(msg: object) {
    if (!this.channel) {
      this.logger.warn('Sem canal RabbitMQ — mensagem descartada');
      return;
    }
    this.channel.sendToQueue(
      'citypulse.manutencao',
      Buffer.from(JSON.stringify(msg)),
      { persistent: true },
    );
  }
}
