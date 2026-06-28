import type { DataPoint } from '@/lib/types';

interface Props {
  pontos: DataPoint[];
  largura?: number;
  altura?: number;
}

/** Gráfico de linha simples em SVG, sem dependências externas. */
export function LineChart({ pontos, largura = 640, altura = 240 }: Props) {
  if (pontos.length === 0) {
    return <p className="muted">Sem dados no período.</p>;
  }

  const margem = { topo: 16, dir: 16, base: 24, esq: 44 };
  const w = largura - margem.esq - margem.dir;
  const h = altura - margem.topo - margem.base;

  const ordenados = [...pontos].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const valores = ordenados.map((p) => p.valor);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const span = max - min || 1;

  const x = (i: number) =>
    margem.esq + (ordenados.length === 1 ? w / 2 : (i / (ordenados.length - 1)) * w);
  const y = (v: number) => margem.topo + h - ((v - min) / span) * h;

  const linha = ordenados.map((p, i) => `${x(i)},${y(p.valor)}`).join(' ');
  const area = `${margem.esq},${margem.topo + h} ${linha} ${margem.esq + w},${margem.topo + h}`;

  return (
    <svg width="100%" viewBox={`0 0 ${largura} ${altura}`} role="img" className="chart">
      {/* eixos de referência */}
      <line x1={margem.esq} y1={margem.topo} x2={margem.esq} y2={margem.topo + h} className="chart-eixo" />
      <line x1={margem.esq} y1={margem.topo + h} x2={margem.esq + w} y2={margem.topo + h} className="chart-eixo" />
      {/* rótulos min/max */}
      <text x={margem.esq - 8} y={margem.topo + 4} className="chart-rotulo" textAnchor="end">
        {max.toFixed(1)}
      </text>
      <text x={margem.esq - 8} y={margem.topo + h} className="chart-rotulo" textAnchor="end">
        {min.toFixed(1)}
      </text>
      {/* área + linha */}
      <polygon points={area} className="chart-area" />
      <polyline points={linha} className="chart-linha" />
    </svg>
  );
}
