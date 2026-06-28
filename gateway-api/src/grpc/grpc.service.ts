import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';

const ZONAS = ['centro', 'norte', 'sul', 'leste'];

// Erros que indicam que o nó está inacessível (não erros de negócio)
const CONNECTIVITY_CODES = new Set([
  grpc.status.UNAVAILABLE,
  grpc.status.DEADLINE_EXCEEDED,
]);

@Injectable()
export class GrpcService implements OnModuleInit {
  private readonly logger = new Logger(GrpcService.name);
  private primaryClients = new Map<string, any>();
  private replicaClients = new Map<string, any>();

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

    for (const zona of ZONAS) {
      const defaultPort = 50051 + ZONAS.indexOf(zona);
      const primaryAddr =
        process.env[`COLETOR_${zona.toUpperCase()}_ADDR`] ||
        `coletor-${zona}:${defaultPort}`;
      const replicaAddr =
        process.env[`COLETOR_${zona.toUpperCase()}_REPLICA_ADDR`] ||
        `coletor-${zona}-replica:${defaultPort}`;

      this.primaryClients.set(
        zona,
        new proto.citypulse.ZoneCollector(primaryAddr, grpc.credentials.createInsecure()),
      );
      this.replicaClients.set(
        zona,
        new proto.citypulse.ZoneCollector(replicaAddr, grpc.credentials.createInsecure()),
      );

      this.logger.log(`gRPC zona=${zona} primário=${primaryAddr} réplica=${replicaAddr}`);
    }
  }

  private call<T>(client: any, method: string, request: object): Promise<T> {
    return new Promise((resolve, reject) => {
      client[method](request, (err: any, res: T) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  }

  // Tenta o primário; se indisponível, redireciona para a réplica promovida.
  private async callWithFailover<T>(
    zonaId: string,
    method: string,
    request: object,
  ): Promise<T> {
    const primary = this.primaryClients.get(zonaId);
    if (!primary) throw new Error(`Zona desconhecida: ${zonaId}`);

    try {
      return await this.call<T>(primary, method, request);
    } catch (err: any) {
      if (CONNECTIVITY_CODES.has(err.code)) {
        this.logger.warn(
          `zona=${zonaId} primário indisponível (gRPC ${err.code}), tentando réplica`,
        );
        const replica = this.replicaClients.get(zonaId)!;
        return await this.call<T>(replica, method, request);
      }
      throw err;
    }
  }

  getZoneStatus(zonaId: string): Promise<any> {
    return this.callWithFailover(zonaId, 'GetZoneStatus', { zona_id: zonaId });
  }

  getZoneHistory(zonaId: string, tipo: string, de: string, ate: string): Promise<any> {
    return this.callWithFailover(zonaId, 'GetZoneHistory', { zona_id: zonaId, tipo, de, ate });
  }

  setThreshold(zonaId: string, tipo: string, limite: number, nivel: string): Promise<any> {
    return this.callWithFailover(zonaId, 'SetThreshold', { zona_id: zonaId, tipo, limite, nivel });
  }
}
