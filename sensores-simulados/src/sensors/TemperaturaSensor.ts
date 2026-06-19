import { BaseSensor } from '../BaseSensor';

export class TemperaturaSensor extends BaseSensor {
  // Estado que evolui suavemente ao longo do tempo
  private valorAtual: number;
  // Probabilidade de gerar um outlier em cada leitura
  private readonly PROB_OUTLIER = 0.05;

  constructor(sensorId: string, zonaId: string, brokerUrl: string, intervaloMin?: number, intervaloMax?: number) {
    super(sensorId, zonaId, 'temperatura', brokerUrl, intervaloMin, intervaloMax);
    // Temperatura inicial aleatória entre 18°C e 28°C
    this.valorAtual = 18 + Math.random() * 10;
  }

  protected gerarValor(): { valor: number; unidade: string } {
    if (Math.random() < this.PROB_OUTLIER) {
      // Outlier: temperatura fisicamente impossível (negativa ou > 60°C)
      const valor = Math.random() < 0.5 ? -50 + Math.random() * 10 : 61 + Math.random() * 20;
      return { valor: parseFloat(valor.toFixed(1)), unidade: 'celsius' };
    }

    // Variação suave: ±1.5°C por leitura, limitada entre -5°C e 45°C
    const delta = (Math.random() - 0.5) * 3;
    this.valorAtual = Math.max(-5, Math.min(45, this.valorAtual + delta));
    return { valor: parseFloat(this.valorAtual.toFixed(1)), unidade: 'celsius' };
  }
}
