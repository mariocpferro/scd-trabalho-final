import { Controller, Get, Post, Param, Query, Body, HttpException, HttpStatus } from '@nestjs/common';
import { GrpcService } from '../grpc/grpc.service';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';

const ZONAS_VALIDAS = ['centro', 'norte', 'sul', 'leste'];

@Controller('zonas')
export class ZonasController {
  constructor(
    private readonly grpcService: GrpcService,
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  @Get()
  listarZonas() {
    return ZONAS_VALIDAS.map((id) => ({
      id,
      nome: id.charAt(0).toUpperCase() + id.slice(1),
    }));
  }

  @Get(':zonaId/status')
  async getStatus(@Param('zonaId') zonaId: string) {
    this.validarZona(zonaId);
    try {
      return await this.grpcService.getZoneStatus(zonaId);
    } catch (err: any) {
      throw new HttpException(
        `Erro ao consultar zona ${zonaId}: ${err.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get(':zonaId/historico')
  async getHistorico(
    @Param('zonaId') zonaId: string,
    @Query('tipo') tipo = 'temperatura',
    @Query('de') de = '',
    @Query('ate') ate = '',
  ) {
    this.validarZona(zonaId);
    try {
      return await this.grpcService.getZoneHistory(zonaId, tipo, de, ate);
    } catch (err: any) {
      throw new HttpException(
        `Erro ao consultar histórico de ${zonaId}: ${err.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Post(':zonaId/limites')
  async setLimite(
    @Param('zonaId') zonaId: string,
    @Body() body: { tipo: string; limite: number; nivel: string },
  ) {
    this.validarZona(zonaId);
    try {
      const resultado = await this.grpcService.setThreshold(
        zonaId,
        body.tipo,
        body.limite,
        body.nivel,
      );
      if (resultado.sucesso) {
        await this.rabbitMqService.publish({
          tipo: 'reconciliacao',
          zona_id: zonaId,
          agendado_em: new Date().toISOString(),
        });
      }
      return resultado;
    } catch (err: any) {
      throw new HttpException(
        `Erro ao configurar limite: ${err.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private validarZona(zonaId: string) {
    if (!ZONAS_VALIDAS.includes(zonaId)) {
      throw new HttpException(`Zona inválida: ${zonaId}`, HttpStatus.BAD_REQUEST);
    }
  }
}
