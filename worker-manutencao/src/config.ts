import 'dotenv/config';
import path from 'path';

const raiz = path.join(__dirname, '..');

export const config = {
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://citypulse:citypulse@localhost:5672',
  fila: process.env.FILA_MANUTENCAO || 'citypulse.manutencao',

  // Diretório do store de zonas (snapshots de primário/réplica e histórico).
  dadosDir: process.env.DADOS_DIR || path.join(raiz, 'dados'),
  // Diretório onde os relatórios periódicos são gravados.
  relatoriosDir: process.env.RELATORIOS_DIR || path.join(raiz, 'relatorios'),

  // Leituras mais antigas que isto (em minutos) são agregadas no downsampling.
  downsamplingIdadeMin: Number(process.env.DOWNSAMPLING_IDADE_MIN || 60),
};
