import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';

const ZONAS = ['centro', 'norte', 'sul', 'leste'];

@Injectable()
export class GrpcService implements OnModuleInit {
  private readonly logger = new Logger(GrpcService.name);
  private clients = new Map<string, any>();

  onModuleInit() {
    const protoPath = join(__dirname, '../../proto/citypulse.proto');
    const packageDef = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDef) as any;
    const isMock = process.env.GRPC_MODE === 'mock';

    // Estratégia de leitura: sempre do primário (addr configurável por variável de ambiente).
    // Para reduzir carga, altere o addr para apontar para a réplica em COLETOR_<ZONA>_ADDR.
    for (const zona of ZONAS) {
      const defaultPort = 50051 + ZONAS.indexOf(zona);
      const addr = isMock
        ? `localhost:50051`
        : (process.env[`COLETOR_${zona.toUpperCase()}_ADDR`] || `coletor-${zona}:${defaultPort}`);

      const client = new proto.citypulse.ZoneCollector(addr, grpc.credentials.createInsecure());
      this.clients.set(zona, client);
      this.logger.log(`gRPC client zona=${zona} → ${addr}`);
    }
  }

  private client(zonaId: string) {
    const c = this.clients.get(zonaId);
    if (!c) throw new Error(`Zona desconhecida: ${zonaId}`);
    return c;
  }

  getZoneStatus(zonaId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client(zonaId).GetZoneStatus({ zona_id: zonaId }, (err: any, res: any) => {
        if (err) reject(err); else resolve(res);
      });
    });
  }

  getZoneHistory(zonaId: string, tipo: string, de: string, ate: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client(zonaId).GetZoneHistory({ zona_id: zonaId, tipo, de, ate }, (err: any, res: any) => {
        if (err) reject(err); else resolve(res);
      });
    });
  }

  setThreshold(zonaId: string, tipo: string, limite: number, nivel: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client(zonaId).SetThreshold({ zona_id: zonaId, tipo, limite, nivel }, (err: any, res: any) => {
        if (err) reject(err); else resolve(res);
      });
    });
  }
}
