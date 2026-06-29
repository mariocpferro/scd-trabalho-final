import { AlertasService, Alerta } from './alertas.service';

const makeAlerta = (overrides: Partial<Alerta> = {}): Alerta => ({
  zona_id: 'centro',
  tipo: 'temperatura',
  nivel: 'alto',
  valor: 42,
  limite: 35,
  mensagem: 'Temperatura elevada',
  timestamp: new Date().toISOString(),
  ...overrides,
});

describe('AlertasService', () => {
  let service: AlertasService;

  beforeEach(() => {
    service = new AlertasService();
  });

  it('começa sem alertas', () => {
    expect(service.getAll()).toHaveLength(0);
  });

  it('adiciona e retorna alertas', () => {
    service.add(makeAlerta());
    expect(service.getAll()).toHaveLength(1);
  });

  it('insere novo alerta no início da lista (mais recente primeiro)', () => {
    service.add(makeAlerta({ valor: 1 }));
    service.add(makeAlerta({ valor: 2 }));
    expect(service.getAll()[0].valor).toBe(2);
  });

  it('filtra por zona_id', () => {
    service.add(makeAlerta({ zona_id: 'norte' }));
    service.add(makeAlerta({ zona_id: 'centro' }));
    const resultado = service.getAll('norte');
    expect(resultado).toHaveLength(1);
    expect(resultado[0].zona_id).toBe('norte');
  });

  it('filtra por nivel', () => {
    service.add(makeAlerta({ nivel: 'critico' }));
    service.add(makeAlerta({ nivel: 'alto' }));
    const resultado = service.getAll(undefined, 'critico');
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nivel).toBe('critico');
  });

  it('filtra por zona_id e nivel ao mesmo tempo', () => {
    service.add(makeAlerta({ zona_id: 'sul', nivel: 'alto' }));
    service.add(makeAlerta({ zona_id: 'sul', nivel: 'critico' }));
    service.add(makeAlerta({ zona_id: 'norte', nivel: 'alto' }));
    const resultado = service.getAll('sul', 'alto');
    expect(resultado).toHaveLength(1);
    expect(resultado[0].zona_id).toBe('sul');
    expect(resultado[0].nivel).toBe('alto');
  });

  it('mantém no máximo 500 alertas (descarta o mais antigo)', () => {
    for (let i = 0; i < 501; i++) {
      service.add(makeAlerta({ valor: i }));
    }
    expect(service.getAll()).toHaveLength(500);
    // O mais recente (valor=500) deve estar na lista; o mais antigo (valor=0) não
    const valores = service.getAll().map((a) => a.valor);
    expect(valores).toContain(500);
    expect(valores).not.toContain(0);
  });
});
