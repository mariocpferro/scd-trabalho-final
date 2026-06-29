import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ZonasController } from './zonas.controller';
import { GrpcService } from '../grpc/grpc.service';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';

const grpcMock = {
  getZoneStatus: jest.fn(),
  getZoneHistory: jest.fn(),
  setThreshold: jest.fn(),
};

const rabbitMock = {
  publish: jest.fn(),
};

describe('ZonasController', () => {
  let controller: ZonasController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ZonasController],
      providers: [
        { provide: GrpcService, useValue: grpcMock },
        { provide: RabbitMqService, useValue: rabbitMock },
      ],
    }).compile();

    controller = module.get(ZonasController);
  });

  describe('listarZonas', () => {
    it('retorna as 4 zonas com id e nome', () => {
      const zonas = controller.listarZonas();
      expect(zonas).toHaveLength(4);
      expect(zonas.map((z) => z.id)).toEqual(['centro', 'norte', 'sul', 'leste']);
      zonas.forEach((z) => {
        expect(z.nome).toBe(z.id.charAt(0).toUpperCase() + z.id.slice(1));
      });
    });
  });

  describe('getStatus', () => {
    it('retorna o status da zona via gRPC', async () => {
      const statusEsperado = { zona_id: 'centro', sensores: [] };
      grpcMock.getZoneStatus.mockResolvedValue(statusEsperado);
      await expect(controller.getStatus('centro')).resolves.toEqual(statusEsperado);
    });

    it('lança 400 para zona inválida', async () => {
      await expect(controller.getStatus('invalida')).rejects.toThrow(
        new HttpException('Zona inválida: invalida', HttpStatus.BAD_REQUEST),
      );
    });

    it('lança 502 quando gRPC falha', async () => {
      grpcMock.getZoneStatus.mockRejectedValue(new Error('connection refused'));
      await expect(controller.getStatus('centro')).rejects.toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
        message: expect.stringContaining('connection refused'),
      });
    });
  });

  describe('getHistorico', () => {
    it('retorna o histórico via gRPC', async () => {
      const historico = { leituras: [] };
      grpcMock.getZoneHistory.mockResolvedValue(historico);
      await expect(controller.getHistorico('sul', 'temperatura', '', '')).resolves.toEqual(historico);
      expect(grpcMock.getZoneHistory).toHaveBeenCalledWith('sul', 'temperatura', '', '');
    });
  });

  describe('setLimite', () => {
    it('chama gRPC e publica reconciliacao no RabbitMQ quando sucesso=true', async () => {
      grpcMock.setThreshold.mockResolvedValue({ sucesso: true });
      rabbitMock.publish.mockResolvedValue(undefined);

      const resultado = await controller.setLimite('norte', {
        tipo: 'temperatura',
        limite: 40,
        nivel: 'alto',
      });

      expect(grpcMock.setThreshold).toHaveBeenCalledWith('norte', 'temperatura', 40, 'alto');
      expect(rabbitMock.publish).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'reconciliacao', zona_id: 'norte' }),
      );
      expect(resultado).toEqual({ sucesso: true });
    });

    it('não publica no RabbitMQ quando sucesso=false', async () => {
      grpcMock.setThreshold.mockResolvedValue({ sucesso: false });

      await controller.setLimite('norte', { tipo: 'temperatura', limite: 40, nivel: 'alto' });

      expect(rabbitMock.publish).not.toHaveBeenCalled();
    });

    it('lança 400 para zona inválida', async () => {
      await expect(
        controller.setLimite('invalida', { tipo: 'temperatura', limite: 40, nivel: 'alto' }),
      ).rejects.toThrow(new HttpException('Zona inválida: invalida', HttpStatus.BAD_REQUEST));
    });
  });
});
