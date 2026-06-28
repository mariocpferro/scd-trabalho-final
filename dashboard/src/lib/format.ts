const ROTULOS: Record<string, string> = {
  temperatura: 'Temperatura',
  qualidade_ar: 'Qualidade do ar',
  vagas_estacionamento: 'Vagas',
  consumo_energia: 'Consumo',
};

const UNIDADES: Record<string, string> = {
  celsius: '°C',
  iqar: 'IQAr',
  vagas: 'vagas',
  kwh: 'kWh',
};

export function rotuloMetrica(tipo: string): string {
  return ROTULOS[tipo] || tipo;
}

export function rotuloUnidade(unidade: string): string {
  return UNIDADES[unidade] || unidade;
}

export function formatarHora(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('pt-BR');
}
