import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { AlertasController } from './alertas.controller';
import { AlertasService } from './alertas.service';

const mockAlerta = {
  zona_id: 'centro',
  tipo: 'temperatura',
  nivel: 'alto',
  valor: 42,
  limite: 35,
  mensagem: 'Temperatura elevada',
  timestamp: '2026-06-29T15:00:00Z',
};

describe('AlertasController', () => {
  let controller: AlertasController;
  let service: AlertasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertasController],
      providers: [AlertasService],
    }).compile();

    controller = module.get(AlertasController);
    service = module.get(AlertasService);
  });

  it('getAlertas sem filtros retorna todos os alertas', () => {
    jest.spyOn(service, 'getAll').mockReturnValue([mockAlerta]);
    const resultado = controller.getAlertas();
    expect(service.getAll).toHaveBeenCalledWith(undefined, undefined);
    expect(resultado).toEqual([mockAlerta]);
  });

  it('getAlertas passa zona e nivel para o serviço', () => {
    jest.spyOn(service, 'getAll').mockReturnValue([]);
    controller.getAlertas('norte', 'critico');
    expect(service.getAll).toHaveBeenCalledWith('norte', 'critico');
  });
});
