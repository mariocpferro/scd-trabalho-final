import mqtt, { MqttClient } from 'mqtt';

export interface LeituraSensor {
  sensor_id: string;
  zona_id: string;
  tipo: string;
  valor: number;
  unidade: string;
  timestamp: string;
}

export abstract class BaseSensor {
  protected sensorId: string;
  protected zonaId: string;
  protected tipo: string;
  protected client: MqttClient;
  private intervaloMin: number;
  private intervaloMax: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    sensorId: string,
    zonaId: string,
    tipo: string,
    brokerUrl: string,
    intervaloMin = 5000,
    intervaloMax = 15000,
  ) {
    this.sensorId = sensorId;
    this.zonaId = zonaId;
    this.tipo = tipo;
    this.intervaloMin = intervaloMin;
    this.intervaloMax = intervaloMax;

    this.client = mqtt.connect(brokerUrl, { clientId: sensorId, clean: true });

    this.client.on('connect', () => {
      console.log(`[${sensorId}] Conectado ao broker MQTT`);
      this.agendar();
    });

    this.client.on('error', (err) => {
      console.error(`[${sensorId}] Erro MQTT:`, err.message);
    });

    this.client.on('close', () => {
      console.log(`[${sensorId}] Conexão MQTT encerrada`);
      if (this.timer) clearTimeout(this.timer);
    });
  }

  protected abstract gerarValor(): { valor: number; unidade: string };

  private proximoIntervalo(): number {
    return (
      Math.floor(Math.random() * (this.intervaloMax - this.intervaloMin + 1)) +
      this.intervaloMin
    );
  }

  private publicar(): void {
    const { valor, unidade } = this.gerarValor();
    const leitura: LeituraSensor = {
      sensor_id: this.sensorId,
      zona_id: this.zonaId,
      tipo: this.tipo,
      valor,
      unidade,
      timestamp: new Date().toISOString(),
    };

    const topico = `citypulse/sensores/${this.zonaId}/${this.tipo}`;
    const payload = JSON.stringify(leitura);

    this.client.publish(topico, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[${this.sensorId}] Falha ao publicar:`, err.message);
      } else {
        console.log(`[${this.sensorId}] → ${topico} | valor=${valor}${unidade}`);
      }
    });

    this.agendar();
  }

  private agendar(): void {
    const delay = this.proximoIntervalo();
    this.timer = setTimeout(() => this.publicar(), delay);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.client.end();
  }
}
