import 'dotenv/config';
import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.INGESTAO_PORT ?? '3001', 10);

// Registro em memória (substitui banco de dados para fins do trabalho)
const sensoresRegistrados = new Map<string, { sensor_id: string; zona_id: string; tipo: string; registrado_em: string }>();

app.post('/sensores/registrar', (req: Request, res: Response) => {
  const { sensor_id, zona_id, tipo } = req.body as { sensor_id?: string; zona_id?: string; tipo?: string };

  if (!sensor_id || !zona_id || !tipo) {
    res.status(400).json({ erro: 'Campos obrigatórios: sensor_id, zona_id, tipo' });
    return;
  }

  const TIPOS_VALIDOS = ['temperatura', 'qualidade_ar', 'vagas_estacionamento', 'consumo_energia'];
  if (!TIPOS_VALIDOS.includes(tipo)) {
    res.status(400).json({ erro: `tipo inválido. Use: ${TIPOS_VALIDOS.join(', ')}` });
    return;
  }

  const registro = { sensor_id, zona_id, tipo, registrado_em: new Date().toISOString() };
  sensoresRegistrados.set(sensor_id, registro);

  console.log(`[ingestão] Sensor registrado: ${sensor_id} zona=${zona_id} tipo=${tipo}`);
  res.status(201).json({ mensagem: 'Sensor registrado com sucesso', sensor: registro });
});

app.get('/sensores', (_req: Request, res: Response) => {
  res.json({ sensores: Array.from(sensoresRegistrados.values()) });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', sensores_registrados: sensoresRegistrados.size });
});

app.listen(PORT, () => {
  console.log(`Serviço de ingestão rodando na porta ${PORT}`);
});
