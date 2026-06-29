import 'reflect-metadata';

// Mocks ANTES dos imports para garantir o hoisting correto do Jest
jest.mock('@grpc/proto-loader', () => ({
  loadSync: jest.fn(() => ({})),
}));

jest.mock('@grpc/grpc-js', () => ({
  credentials: { createInsecure: jest.fn(() => ({})) },
  status: { UNAVAILABLE: 14, DEADLINE_EXCEEDED: 4 },
  loadPackageDefinition: jest.fn(() => ({
    citypulse: { ZoneCollector: jest.fn(() => ({})) },
  })),
}));

import { GrpcService } from './grpc.service';

// Cria um cliente gRPC falso cujos métodos chamam o callback imediatamente
const makeClient = (responses: Record<string, { err?: any; res?: any }>) => {
  const client: any = {};
  for (const [method, { err, res }] of Object.entries(responses)) {
    client[method] = jest.fn((_req: any, cb: (e: any, r: any) => void) =>
      cb(err ?? null, res ?? null),
    );
  }
  return client;
};

describe('GrpcService', () => {
  let service: GrpcService;

  beforeEach(() => {
    service = new GrpcService();
    service.onModuleInit();
  });

  describe('getZoneStatus', () => {
    it('retorna status do primário quando disponível', async () => {
      const primary = makeClient({ GetZoneStatus: { res: { zona_id: 'centro' } } });
      (service as any).primaryClients.set('centro', primary);

      const result = await service.getZoneStatus('centro');

      expect(result).toEqual({ zona_id: 'centro' });
      expect(primary.GetZoneStatus).toHaveBeenCalledWith(
        { zona_id: 'centro' },
        expect.any(Function),
      );
    });

    it('faz failover para réplica quando primário retorna UNAVAILABLE', async () => {
      const primary = makeClient({ GetZoneStatus: { err: { code: 14 } } }); // UNAVAILABLE
      const replica = makeClient({ GetZoneStatus: { res: { via: 'replica' } } });
      (service as any).primaryClients.set('centro', primary);
      (service as any).replicaClients.set('centro', replica);

      const result = await service.getZoneStatus('centro');

      expect(result).toEqual({ via: 'replica' });
      expect(replica.GetZoneStatus).toHaveBeenCalled();
    });

    it('faz failover para réplica quando primário retorna DEADLINE_EXCEEDED', async () => {
      const primary = makeClient({ GetZoneStatus: { err: { code: 4 } } }); // DEADLINE_EXCEEDED
      const replica = makeClient({ GetZoneStatus: { res: { ok: true } } });
      (service as any).primaryClients.set('centro', primary);
      (service as any).replicaClients.set('centro', replica);

      const result = await service.getZoneStatus('centro');
      expect(result).toEqual({ ok: true });
    });

    it('não faz failover para erros de negócio (ex: NOT_FOUND)', async () => {
      const primary = makeClient({ GetZoneStatus: { err: { code: 5 } } }); // NOT_FOUND
      const replica = makeClient({ GetZoneStatus: { res: {} } });
      (service as any).primaryClients.set('centro', primary);
      (service as any).replicaClients.set('centro', replica);

      await expect(service.getZoneStatus('centro')).rejects.toEqual({ code: 5 });
      expect(replica.GetZoneStatus).not.toHaveBeenCalled();
    });
  });

  describe('getZoneHistory', () => {
    it('passa todos os parâmetros corretos ao gRPC', async () => {
      const primary = makeClient({ GetZoneHistory: { res: { leituras: [] } } });
      (service as any).primaryClients.set('norte', primary);

      await service.getZoneHistory('norte', 'temperatura', '2026-01-01', '2026-01-31');

      expect(primary.GetZoneHistory).toHaveBeenCalledWith(
        { zona_id: 'norte', tipo: 'temperatura', de: '2026-01-01', ate: '2026-01-31' },
        expect.any(Function),
      );
    });
  });

  describe('setThreshold', () => {
    it('passa todos os parâmetros corretos ao gRPC', async () => {
      const primary = makeClient({ SetThreshold: { res: { sucesso: true } } });
      (service as any).primaryClients.set('sul', primary);

      const result = await service.setThreshold('sul', 'qualidade_ar', 150, 'alto');

      expect(primary.SetThreshold).toHaveBeenCalledWith(
        { zona_id: 'sul', tipo: 'qualidade_ar', limite: 150, nivel: 'alto' },
        expect.any(Function),
      );
      expect(result).toEqual({ sucesso: true });
    });
  });
});
