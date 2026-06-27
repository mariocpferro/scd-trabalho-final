import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`WS conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WS desconectado: ${client.id}`);
  }

  // Formato Socket.io: cliente emite evento 'subscribe' com { zona_id }
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { zona_id: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`zona:${data.zona_id}`);
    this.logger.log(`${client.id} subscreveu zona=${data.zona_id}`);
  }

  // Formato mensagem raw: { acao: 'subscribe', zona_id }
  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() data: { acao: string; zona_id: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data.acao === 'subscribe' && data.zona_id) {
      client.join(`zona:${data.zona_id}`);
      this.logger.log(`${client.id} subscreveu zona=${data.zona_id} (via message)`);
    }
  }

  emitAlerta(zonaId: string, dados: any) {
    const payload = { evento: 'alerta', dados };
    this.server.to(`zona:${zonaId}`).emit('message', payload);
  }

  emitStatusUpdate(zonaId: string, dados: any) {
    this.server.to(`zona:${zonaId}`).emit('message', { evento: 'status_update', dados });
  }
}
