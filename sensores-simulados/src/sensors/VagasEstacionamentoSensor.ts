import { BaseSensor } from '../BaseSensor';

// Publica vagas livres no momento. O total (fixo por zona) é embutido na unidade.
// Formato do valor: vagas livres (ex.: 47 de um total de 100)
export class VagasEstacionamentoSensor extends BaseSensor {
  private vagasLivres: number;
  private readonly totalVagas: number;
  private readonly PROB_OUTLIER = 0.04;

  constructor(sensorId: string, zonaId: string, brokerUrl: string, intervaloMin?: number, intervaloMax?: number) {
    super(sensorId, zonaId, 'vagas_estacionamento', brokerUrl, intervaloMin, intervaloMax);
    this.totalVagas = 100;
    // Começa com ocupação aleatória entre 20% e 80%
    this.vagasLivres = Math.floor(this.totalVagas * (0.2 + Math.random() * 0.6));
  }

  protected gerarValor(): { valor: number; unidade: string } {
    if (Math.random() < this.PROB_OUTLIER) {
      // Outlier: valor negativo ou acima do total
      const valor = Math.random() < 0.5 ? -5 - Math.floor(Math.random() * 10) : this.totalVagas + 10 + Math.floor(Math.random() * 20);
      return { valor, unidade: `vagas/${this.totalVagas}` };
    }

    // A cada leitura, simula entrada/saída de carros (-3 a +3 vagas)
    const delta = Math.floor((Math.random() - 0.5) * 7);
    this.vagasLivres = Math.max(0, Math.min(this.totalVagas, this.vagasLivres + delta));
    return { valor: this.vagasLivres, unidade: `vagas/${this.totalVagas}` };
  }
}
