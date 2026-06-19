import 'dotenv/config';
import { BaseSensor } from './BaseSensor';
import { TemperaturaSensor } from './sensors/TemperaturaSensor';
import { QualidadeArSensor } from './sensors/QualidadeArSensor';
import { VagasEstacionamentoSensor } from './sensors/VagasEstacionamentoSensor';
import { ConsumoEnergiaSensor } from './sensors/ConsumoEnergiaSensor';

const SENSOR_ID = process.env.SENSOR_ID;
const ZONA_ID = process.env.ZONA_ID;
const TIPO = process.env.TIPO;
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
const INTERVALO_MIN = parseInt(process.env.INTERVALO_MIN_MS ?? '5000', 10);
const INTERVALO_MAX = parseInt(process.env.INTERVALO_MAX_MS ?? '15000', 10);

if (!SENSOR_ID || !ZONA_ID || !TIPO) {
  console.error('Variáveis obrigatórias: SENSOR_ID, ZONA_ID, TIPO');
  process.exit(1);
}

const TIPOS_VALIDOS = ['temperatura', 'qualidade_ar', 'vagas_estacionamento', 'consumo_energia'];
if (!TIPOS_VALIDOS.includes(TIPO)) {
  console.error(`TIPO inválido: "${TIPO}". Use: ${TIPOS_VALIDOS.join(', ')}`);
  process.exit(1);
}

function criarSensor(): BaseSensor {
  const args: [string, string, string, number, number] = [SENSOR_ID!, ZONA_ID!, MQTT_BROKER_URL, INTERVALO_MIN, INTERVALO_MAX];
  switch (TIPO) {
    case 'temperatura':            return new TemperaturaSensor(...args);
    case 'qualidade_ar':           return new QualidadeArSensor(...args);
    case 'vagas_estacionamento':   return new VagasEstacionamentoSensor(...args);
    case 'consumo_energia':        return new ConsumoEnergiaSensor(...args);
    default:                       throw new Error('tipo inválido');
  }
}

const sensor = criarSensor();
console.log(`Sensor iniciado: id=${SENSOR_ID} zona=${ZONA_ID} tipo=${TIPO} broker=${MQTT_BROKER_URL}`);

process.on('SIGTERM', () => { sensor.stop(); process.exit(0); });
process.on('SIGINT',  () => { sensor.stop(); process.exit(0); });
