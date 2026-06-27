import { Injectable, Logger } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';

// Servidor gRPC local para testes sem o coletor-zona Java rodando.
// Ativo quando GRPC_MODE=mock.
@Injectable()
export class MockColetorService {
  private readonly logger = new Logger(MockColetorService.name);
  private server: grpc.Server;

  async start() {
    const protoPath = join(__dirname, '../../proto/citypulse.proto');
    const packageDef = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef) as any;

    this.server = new grpc.Server();
    this.server.addService(proto.citypulse.ZoneCollector.service, {
      GetZoneStatus: (call: any, cb: any) => {
        const zona = call.request.zona_id;
        cb(null, {
          zona_id: zona,
          papel_no_momento: 'PRIMARIO',
          atualizado_em: new Date().toISOString(),
          metricas: [
            { tipo: 'temperatura', valor: +(23.5 + Math.random() * 5).toFixed(1), unidade: 'celsius', timestamp: new Date().toISOString() },
            { tipo: 'qualidade_ar', valor: +(80 + Math.random() * 40).toFixed(0), unidade: 'iqar', timestamp: new Date().toISOString() },
            { tipo: 'vagas_estacionamento', valor: Math.floor(30 + Math.random() * 70), unidade: 'vagas', timestamp: new Date().toISOString() },
            { tipo: 'consumo_energia', valor: +(100 + Math.random() * 100).toFixed(1), unidade: 'kwh', timestamp: new Date().toISOString() },
          ],
        });
      },
      GetZoneHistory: (call: any, cb: any) => {
        const pontos = Array.from({ length: 20 }, (_, i) => ({
          timestamp: new Date(Date.now() - i * 60_000).toISOString(),
          valor: +(20 + Math.random() * 10).toFixed(2),
        }));
        cb(null, { pontos });
      },
      SetThreshold: (_call: any, cb: any) => {
        // Simula confirmação de primário e réplica (consistência forte)
        setTimeout(() => {
          cb(null, { sucesso: true, confirmado_primario: true, confirmado_replica: true });
        }, 50);
      },
    });

    await new Promise<void>((resolve, reject) => {
      this.server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), (err) => {
        if (err) reject(err);
        else { this.server.start(); resolve(); }
      });
    });

    this.logger.log('Mock gRPC coletor ouvindo em :50051 (todas as zonas)');
  }
}
