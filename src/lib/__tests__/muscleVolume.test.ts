// Testes de src/lib/muscleVolume.ts. O teste de fuso-horário abaixo é o
// que mais importa aqui: `log_date` chega do Postgres como "yyyy-mm-dd"
// (sem hora), e um `new Date(...)` ingênuo nesse formato empurra a data
// um dia pra trás em fusos negativos (Brasil) — rodando esse teste local
// (UTC-3) ele pegaria a regressão que o CI (UTC) não pegaria sozinho.

import { volumeTier, weeklyVolumeByMuscleGroup, type LoggedSetEntry } from '../muscleVolume';

describe('weeklyVolumeByMuscleGroup', () => {
  it('conta séries por grupo muscular dentro da mesma semana', () => {
    const entries: LoggedSetEntry[] = [
      { muscleGroup: 'Peito', logDate: '2026-08-17' },
      { muscleGroup: 'Peito', logDate: '2026-08-19' },
      { muscleGroup: 'Costas', logDate: '2026-08-18' },
    ];
    const weeks = weeklyVolumeByMuscleGroup(entries);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekStartIso).toBe('2026-08-17');
    expect(weeks[0].setsByMuscle.Peito).toBe(2);
    expect(weeks[0].setsByMuscle.Costas).toBe(1);
  });

  it('separa em semanas diferentes quando a data cai em semanas diferentes', () => {
    const entries: LoggedSetEntry[] = [
      { muscleGroup: 'Peito', logDate: '2026-08-17' },
      { muscleGroup: 'Peito', logDate: '2026-08-24' },
    ];
    expect(weeklyVolumeByMuscleGroup(entries)).toHaveLength(2);
  });

  it('agrupa séries sem grupo muscular cadastrado em "Sem grupo", em vez de descartar', () => {
    const entries: LoggedSetEntry[] = [{ muscleGroup: null, logDate: '2026-08-17' }];
    const weeks = weeklyVolumeByMuscleGroup(entries);
    expect(weeks[0].setsByMuscle['Sem grupo']).toBe(1);
  });

  it('não empurra uma data que é segunda-feira pra semana anterior (pegadinha de fuso com data "só dia")', () => {
    // 2026-08-17 é uma segunda-feira de verdade — se new Date() ingênuo
    // interpretasse como UTC e o ambiente rodasse num fuso negativo, essa
    // série cairia como se fosse domingo da semana ANTERIOR (2026-08-10).
    const entries: LoggedSetEntry[] = [{ muscleGroup: 'Pernas', logDate: '2026-08-17' }];
    const weeks = weeklyVolumeByMuscleGroup(entries);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekStartIso).toBe('2026-08-17');
  });

  it('não empurra o último dia da semana (domingo) pra semana seguinte', () => {
    // 2026-08-23 é domingo — tem que ficar na MESMA semana que começou
    // em 2026-08-17, não virar o início de uma semana nova.
    const entries: LoggedSetEntry[] = [{ muscleGroup: 'Pernas', logDate: '2026-08-23' }];
    const weeks = weeklyVolumeByMuscleGroup(entries);
    expect(weeks[0].weekStartIso).toBe('2026-08-17');
  });

  it('retorna lista vazia sem nenhuma série', () => {
    expect(weeklyVolumeByMuscleGroup([])).toEqual([]);
  });
});

describe('volumeTier', () => {
  it('classifica abaixo de 4 séries como baixo', () => {
    expect(volumeTier(0)).toBe('baixo');
    expect(volumeTier(3)).toBe('baixo');
  });

  it('classifica de 4 a 10 séries como moderado', () => {
    expect(volumeTier(4)).toBe('moderado');
    expect(volumeTier(10)).toBe('moderado');
  });

  it('classifica acima de 10 séries como alto', () => {
    expect(volumeTier(11)).toBe('alto');
  });
});
