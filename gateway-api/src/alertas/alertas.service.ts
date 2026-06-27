import { Injectable } from '@nestjs/common';

export interface Alerta {
  zona_id: string;
  tipo: string;
  nivel: string;
  valor: number;
  limite: number;
  mensagem: string;
  timestamp: string;
}

@Injectable()
export class AlertasService {
  private readonly alertas: Alerta[] = [];

  add(alerta: Alerta) {
    this.alertas.unshift(alerta);
    if (this.alertas.length > 500) this.alertas.pop();
  }

  getAll(zona?: string, nivel?: string): Alerta[] {
    return this.alertas.filter(
      (a) => (!zona || a.zona_id === zona) && (!nivel || a.nivel === nivel),
    );
  }
}
