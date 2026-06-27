import { Controller, Get, Query } from '@nestjs/common';
import { AlertasService } from './alertas.service';

@Controller('alertas')
export class AlertasController {
  constructor(private readonly alertasService: AlertasService) {}

  @Get()
  getAlertas(@Query('zona') zona?: string, @Query('nivel') nivel?: string) {
    return this.alertasService.getAll(zona, nivel);
  }
}
