/**
 * Script de carga: sobe múltiplos sensores simultaneamente no mesmo processo
 * para testar concorrência no broker MQTT e no coletor de zona.
 *
 * Uso: MQTT_BROKER_URL=mqtt://localhost:1883 ts-node scripts/load-test.ts
 *
 * Por padrão sobe 4 sensores por tipo por zona = 64 sensores simultâneos.
 * Ajuste NUM_SENSORES_POR_TIPO para aumentar a carga.
 */

import 'dotenv/config';
import { TemperaturaSensor } from '../src/sensors/TemperaturaSensor';
import { QualidadeArSensor } from '../src/sensors/QualidadeArSensor';
import { VagasEstacionamentoSensor } from '../src/sensors/VagasEstacionamentoSensor';
import { ConsumoEnergiaSensor } from '../src/sensors/ConsumoEnergiaSensor';
import { BaseSensor } from '../src/BaseSensor';

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
const NUM_SENSORES_POR_TIPO = parseInt(process.env.NUM_SENSORES_POR_TIPO ?? '4', 10);
// Intervalo mais curto para gerar carga rápida
const INTERVALO_MIN = parseInt(process.env.CARGA_MIN_MS ?? '1000', 10);
const INTERVALO_MAX = parseInt(process.env.CARGA_MAX_MS ?? '3000', 10);

const ZONAS = ['centro', 'norte', 'sul', 'leste'];
const TIPOS = ['temperatura', 'qualidade_ar', 'vagas_estacionamento', 'consumo_energia'] as const;

const sensores: BaseSensor[] = [];

for (const zona of ZONAS) {
  for (const tipo of TIPOS) {
    for (let i = 1; i <= NUM_SENSORES_POR_TIPO; i++) {
      const sensorId = `sensor-carga-${zona}-${tipo}-${String(i).padStart(2, '0')}`;
      let sensor: BaseSensor;

      switch (tipo) {
        case 'temperatura':
          sensor = new TemperaturaSensor(sensorId, zona, MQTT_BROKER_URL, INTERVALO_MIN, INTERVALO_MAX);
          break;
        case 'qualidade_ar':
          sensor = new QualidadeArSensor(sensorId, zona, MQTT_BROKER_URL, INTERVALO_MIN, INTERVALO_MAX);
          break;
        case 'vagas_estacionamento':
          sensor = new VagasEstacionamentoSensor(sensorId, zona, MQTT_BROKER_URL, INTERVALO_MIN, INTERVALO_MAX);
          break;
        case 'consumo_energia':
          sensor = new ConsumoEnergiaSensor(sensorId, zona, MQTT_BROKER_URL, INTERVALO_MIN, INTERVALO_MAX);
          break;
      }

      sensores.push(sensor);
    }
  }
}

const total = sensores.length;
console.log(`[carga] ${total} sensores iniciados (${NUM_SENSORES_POR_TIPO} por tipo por zona)`);
console.log(`[carga] Intervalo de publicação: ${INTERVALO_MIN}–${INTERVALO_MAX} ms`);
console.log('[carga] Pressione Ctrl+C para encerrar');

function encerrar(): void {
  console.log(`\n[carga] Encerrando ${total} sensores...`);
  sensores.forEach((s) => s.stop());
  process.exit(0);
}

process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
