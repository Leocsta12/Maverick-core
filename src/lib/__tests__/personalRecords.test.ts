import {
  currentPersonalRecords,
  detectPrHistory,
  estimateOneRepMax,
  isNewPersonalRecord,
  type LoggedSet,
} from '../personalRecords';

describe('estimateOneRepMax', () => {
  it('usa a fórmula de Epley pra reps entre 2 e 12', () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(100 * (1 + 5 / 30));
    expect(estimateOneRepMax(80, 10)).toBeCloseTo(80 * (1 + 10 / 30));
  });

  it('com 1 rep, o 1RM é a própria carga (sem estimativa)', () => {
    expect(estimateOneRepMax(120, 1)).toBe(120);
  });

  it('é null pra carga ou reps zero/negativos', () => {
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(-10, 5)).toBeNull();
    expect(estimateOneRepMax(100, 0)).toBeNull();
    expect(estimateOneRepMax(100, -3)).toBeNull();
  });

  it('é null acima de 12 reps — fora da faixa confiável da fórmula', () => {
    expect(estimateOneRepMax(50, 15)).toBeNull();
  });

  it('inclui a borda de 12 reps', () => {
    expect(estimateOneRepMax(50, 12)).toBeCloseTo(50 * (1 + 12 / 30));
  });
});

describe('currentPersonalRecords', () => {
  it('pega o maior 1RM estimado por exercício, mesmo fora de ordem', () => {
    const sets: LoggedSet[] = [
      { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 80, repsDone: 5, logDate: '2024-01-10' },
      { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 90, repsDone: 3, logDate: '2024-02-01' },
      { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 60, repsDone: 8, logDate: '2024-02-15' },
    ];
    const prs = currentPersonalRecords(sets);
    expect(prs).toHaveLength(1);
    expect(prs[0].weightKg).toBe(90);
    expect(prs[0].repsDone).toBe(3);
  });

  it('separa recordes por exercício e ordena por nome', () => {
    const sets: LoggedSet[] = [
      { exerciseId: 'agachamento', exerciseName: 'Agachamento livre', weightKg: 100, repsDone: 5, logDate: '2024-01-01' },
      { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 80, repsDone: 5, logDate: '2024-01-01' },
    ];
    const prs = currentPersonalRecords(sets);
    expect(prs.map((p) => p.exerciseName)).toEqual(['Agachamento livre', 'Supino reto']);
  });

  it('ignora séries fora da faixa confiável (mais de 12 reps) no cálculo de recorde', () => {
    const sets: LoggedSet[] = [
      { exerciseId: 'rosca', exerciseName: 'Rosca direta', weightKg: 20, repsDone: 20, logDate: '2024-01-01' },
    ];
    expect(currentPersonalRecords(sets)).toHaveLength(0);
  });

  it('lista vazia quando não há séries', () => {
    expect(currentPersonalRecords([])).toEqual([]);
  });
});

describe('detectPrHistory', () => {
  it('marca só as séries que bateram o recorde anterior daquele exercício', () => {
    const sets: LoggedSet[] = [
      { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 60, repsDone: 8, logDate: '2024-01-01' }, // PR #1
      { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 62, repsDone: 8, logDate: '2024-01-08' }, // PR #2
      { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 55, repsDone: 8, logDate: '2024-01-15' }, // abaixo, não é PR
      { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 65, repsDone: 8, logDate: '2024-01-22' }, // PR #3
    ];
    const prs = detectPrHistory(sets);
    expect(prs.map((p) => p.logDate)).toEqual(['2024-01-01', '2024-01-08', '2024-01-22']);
  });

  it('empate no 1RM estimado não conta como novo recorde', () => {
    const sets: LoggedSet[] = [
      { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 100, repsDone: 1, logDate: '2024-01-01' },
      { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 100, repsDone: 1, logDate: '2024-01-08' },
    ];
    expect(detectPrHistory(sets)).toHaveLength(1);
  });

  it('exercícios diferentes têm históricos de PR independentes', () => {
    const sets: LoggedSet[] = [
      { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 80, repsDone: 5, logDate: '2024-01-01' },
      { exerciseId: 'agachamento', exerciseName: 'Agachamento livre', weightKg: 100, repsDone: 5, logDate: '2024-01-01' },
    ];
    expect(detectPrHistory(sets)).toHaveLength(2);
  });
});

describe('isNewPersonalRecord', () => {
  const priorSets: LoggedSet[] = [
    { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 80, repsDone: 5, logDate: '2024-01-01' },
  ];

  it('é true quando não há nenhum histórico anterior desse exercício (primeira vez)', () => {
    const newSet: LoggedSet = { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 60, repsDone: 8, logDate: '2024-02-01' };
    expect(isNewPersonalRecord([], newSet)).toBe(true);
  });

  it('é true quando a nova série bate o recorde anterior', () => {
    const newSet: LoggedSet = { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 85, repsDone: 5, logDate: '2024-02-01' };
    expect(isNewPersonalRecord(priorSets, newSet)).toBe(true);
  });

  it('é false quando a nova série fica igual ou abaixo do recorde anterior', () => {
    const empatou: LoggedSet = { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 80, repsDone: 5, logDate: '2024-02-01' };
    const abaixo: LoggedSet = { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 70, repsDone: 5, logDate: '2024-02-01' };
    expect(isNewPersonalRecord(priorSets, empatou)).toBe(false);
    expect(isNewPersonalRecord(priorSets, abaixo)).toBe(false);
  });

  it('é false quando a série nova está fora da faixa confiável de reps', () => {
    const newSet: LoggedSet = { exerciseId: 'supino', exerciseName: 'Supino reto', weightKg: 200, repsDone: 20, logDate: '2024-02-01' };
    expect(isNewPersonalRecord(priorSets, newSet)).toBe(false);
  });

  it('histórico de outro exercício não interfere', () => {
    const newSet: LoggedSet = { exerciseId: 'agachamento', exerciseName: 'Agachamento livre', weightKg: 10, repsDone: 5, logDate: '2024-02-01' };
    expect(isNewPersonalRecord(priorSets, newSet)).toBe(true);
  });
});
