import { BaseSensor } from '../BaseSensor';

// Índice de qualidade do ar: 0 (ótimo) a 500 (perigoso)
// Limite warning = 150, critical = 300 (padrão configurável no coletor)
export class QualidadeArSensor extends BaseSensor {
  private valorAtual: number;
  private readonly PROB_OUTLIER = 0.05;

  constructor(sensorId: string, zonaId: string, brokerUrl: string, intervaloMin?: number, intervaloMax?: number) {
    super(sensorId, zonaId, 'qualidade_ar', brokerUrl, intervaloMin, intervaloMax);
    this.valorAtual = 50 + Math.random() * 100;
  }

  protected gerarValor(): { valor: number; unidade: string } {
    if (Math.random() < this.PROB_OUTLIER) {
      // Outlier: índice negativo ou absurdamente alto (>500)
      const valor = Math.random() < 0.5 ? -10 - Math.random() * 20 : 501 + Math.random() * 200;
      return { valor: parseFloat(valor.toFixed(0)), unidade: 'AQI' };
    }

    // Variação suave: ±15 AQI por leitura, limitado entre 0 e 500
    const delta = (Math.random() - 0.45) * 30; // levemente tendendo a piorar
    this.valorAtual = Math.max(0, Math.min(500, this.valorAtual + delta));
    return { valor: parseFloat(this.valorAtual.toFixed(0)), unidade: 'AQI' };
  }
}
