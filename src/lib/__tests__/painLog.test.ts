import { annotatePainWithLoadRisk, severityLabel, summarizePainRiskCorrelation, type PainEntry } from '../painLog';

describe('severityLabel', () => {
  it('é "Leve" de 1 a 3', () => {
    expect(severityLabel(1)).toBe('Leve');
    expect(severityLabel(3)).toBe('Leve');
  });

  it('é "Moderada" de 4 a 6', () => {
    expect(severityLabel(4)).toBe('Moderada');
    expect(severityLabel(6)).toBe('Moderada');
  });

  it('é "Forte" de 7 a 10', () => {
    expect(severityLabel(7)).toBe('Forte');
    expect(severityLabel(10)).toBe('Forte');
  });
});

function painEntry(entryDate: string, overrides: Partial<PainEntry> = {}): PainEntry {
  return {
    id: entryDate,
    entryDate,
    bodyPart: 'Joelho',
    exerciseId: null,
    exerciseName: null,
    severity: 8,
    notes: null,
    createdAt: `${entryDate}T12:00:00Z`,
    ...overrides,
  };
}

describe('annotatePainWithLoadRisk', () => {
  // Mesmo cenário de "risco alto" de trainingLoad.test.ts: 3 semanas leves
  // de base + um pico recente bem acima da carga crônica. maxHeartrate
  // precisa vir em pelo menos uma atividade — é dela que
  // estimateMaxHeartrate tira a FC máxima do atleta.
  const now = new Date('2026-08-21T12:00:00Z');
  const spikeActivities = [
    ...[8, 15, 22].map((daysAgo) => ({
      movingTimeSeconds: 900,
      averageHeartrate: 110,
      maxHeartrate: 190,
      startedAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      sportType: 'Run',
    })),
    {
      movingTimeSeconds: 7200,
      averageHeartrate: 170,
      maxHeartrate: 190,
      startedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      sportType: 'Run',
    },
  ];

  it('marca null quando não há FC máxima estimável (sem Strava conectado)', () => {
    const result = annotatePainWithLoadRisk([painEntry('2026-08-21')], []);
    expect(result[0].loadRiskAtTime).toBeNull();
  });

  it('marca o risco de carga que existia NAQUELE DIA, não o de hoje', () => {
    const duranteOPico = painEntry('2026-08-21'); // dia do pico de carga
    const antesDeQualquerAtividade = painEntry('2026-07-25'); // nenhuma atividade ainda aconteceu
    const result = annotatePainWithLoadRisk([duranteOPico, antesDeQualquerAtividade], spikeActivities);
    expect(result[0].loadRiskAtTime).toBe('alto');
    // Sem histórico suficiente pra avaliar ainda, acuteChronicRatio não
    // alarma à toa — 'ideal' aqui significa "sem dado", não "carga boa".
    expect(result[1].loadRiskAtTime).toBe('ideal');
  });
});

describe('summarizePainRiskCorrelation', () => {
  it('conta só dores fortes (severidade >= 7) com risco conhecido', () => {
    const entries = [
      { ...painEntry('2026-08-21', { severity: 8 }), loadRiskAtTime: 'alto' as const },
      { ...painEntry('2026-08-20', { severity: 3 }), loadRiskAtTime: 'alto' as const }, // leve, não conta
      { ...painEntry('2026-08-19', { severity: 9 }), loadRiskAtTime: null }, // sem risco conhecido, não conta
      { ...painEntry('2026-08-18', { severity: 7 }), loadRiskAtTime: 'ideal' as const },
    ];
    expect(summarizePainRiskCorrelation(entries)).toEqual({ severeWithKnownRisk: 2, severeDuringHighRisk: 1 });
  });

  it('é zero a zero sem nenhum registro', () => {
    expect(summarizePainRiskCorrelation([])).toEqual({ severeWithKnownRisk: 0, severeDuringHighRisk: 0 });
  });
});
