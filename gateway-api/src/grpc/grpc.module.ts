import { Module } from '@nestjs/common';
import { GrpcService } from './grpc.service';
import { MockColetorService } from './mock-coletor.service';

@Module({
  providers: [GrpcService, MockColetorService],
  exports: [GrpcService, MockColetorService],
})
export class GrpcModule {}
