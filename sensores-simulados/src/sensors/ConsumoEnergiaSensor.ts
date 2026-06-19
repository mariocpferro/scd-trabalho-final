import { BaseSensor } from '../BaseSensor';

// Consumo em kWh. Simula picos em horário comercial (8h-18h) e noturno (22h).
export class ConsumoEnergiaSensor extends BaseSensor {
  private valorAtual: number;
  private readonly PROB_OUTLIER = 0.04;

  constructor(sensorId: string, zonaId: string, brokerUrl: string, intervaloMin?: number, intervaloMax?: number) {
    super(sensorId, zonaId, 'consumo_energia', brokerUrl, intervaloMin, intervaloMax);
    this.valorAtual = 200 + Math.random() * 100;
  }

  // Fator de carga baseado na hora do dia (0–1)
  private fatorHorario(): number {
    const hora = new Date().getHours();
    if (hora >= 8 && hora < 18) return 0.8 + Math.random() * 0.4; // pico diurno
    if (hora >= 18 && hora < 22) return 0.5 + Math.random() * 0.2; // entardecer
    if (hora >= 22 || hora < 6) return 0.2 + Math.random() * 0.1;  // madrugada
    return 0.4 + Math.random() * 0.2; // manhã cedo
  }

  protected gerarValor(): { valor: number; unidade: string } {
    if (Math.random() < this.PROB_OUTLIER) {
      // Outlier: consumo negativo ou absurdo (>2000 kWh)
      const valor = Math.random() < 0.5 ? -50 - Math.random() * 50 : 2001 + Math.random() * 500;
      return { valor: parseFloat(valor.toFixed(2)), unidade: 'kWh' };
    }

    const base = 150;
    const fator = this.fatorHorario();
    const alvo = base + fator * 600;
    // Suaviza: move 20% em direção ao alvo + ruído pequeno
    this.valorAtual += (alvo - this.valorAtual) * 0.2 + (Math.random() - 0.5) * 20;
    this.valorAtual = Math.max(50, this.valorAtual);
    return { valor: parseFloat(this.valorAtual.toFixed(2)), unidade: 'kWh' };
  }
}
