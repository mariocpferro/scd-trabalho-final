interface Props {
  papel: string | undefined;
}

export function PapelBadge({ papel }: Props) {
  const ehPrimario = papel === 'PRIMARIO';
  const classe = ehPrimario ? 'badge badge-primario' : 'badge badge-replica';
  const texto = papel === 'PRIMARIO' ? 'PRIMÁRIO' : papel === 'REPLICA' ? 'RÉPLICA' : '—';
  return <span className={classe}>{texto}</span>;
}
