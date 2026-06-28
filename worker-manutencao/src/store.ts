import fs from 'fs';
import path from 'path';
import { config } from './config';
import { Papel, SnapshotZona } from './types';

function caminhoSnapshot(zonaId: string, papel: Papel): string {
  return path.join(config.dadosDir, `${zonaId}-${papel}.json`);
}

export function garantirDirs(): void {
  fs.mkdirSync(config.dadosDir, { recursive: true });
  fs.mkdirSync(config.relatoriosDir, { recursive: true });
}

export function lerSnapshot(zonaId: string, papel: Papel): SnapshotZona | null {
  const caminho = caminhoSnapshot(zonaId, papel);
  if (!fs.existsSync(caminho)) return null;
  return JSON.parse(fs.readFileSync(caminho, 'utf-8')) as SnapshotZona;
}

export function salvarSnapshot(snapshot: SnapshotZona): void {
  garantirDirs();
  const caminho = caminhoSnapshot(snapshot.zona_id, snapshot.papel);
  fs.writeFileSync(caminho, JSON.stringify(snapshot, null, 2));
}

export function salvarRelatorio(zonaId: string, conteudo: unknown): string {
  garantirDirs();
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const caminho = path.join(config.relatoriosDir, `${zonaId}-${carimbo}.json`);
  fs.writeFileSync(caminho, JSON.stringify(conteudo, null, 2));
  return caminho;
}
