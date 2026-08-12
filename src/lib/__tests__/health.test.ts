import { HealthEntry, computeMaverickScore, deriveInsight } from '../health';

function entry(partial: Partial<HealthEntry> & { entryDate: string }): HealthEntry {
  return {
    id: partial.entryDate,
    sleepHours: null,
    hrvMs: null,
    restingHr: null,
    steps: null,
    weightKg: null,
    bodyFatPct: null,
    ...partial,
  };
}

describe('computeMaverickScore', () => {
  it('retorna null sem nenhum registro', () => {
    expect(computeMaverickScore([])).toBeNull();
  });

  it('usa a linha de base neutra (70) quando não há histórico pra HRV/FC de repouso', () => {
    const score = computeMaverickScore([
      entry({ entryDate: '2024-01-10', sleepHours: 8, steps: 8000, hrvMs: 55, restingHr: 60 }),
    ]);
    // sono 100*0.35 + hrv neutro 70*0.30 + fc neutro 70*0.20 + passos 100*0.15 = 85
    expect(score).toBe(85);
  });

  it('pontua HRV acima da própria linha de base pessoal como melhor que neutro', () => {
    const score = computeMaverickScore([
      entry({ entryDate: '2024-01-01', hrvMs: 50 }),
      entry({ entryDate: '2024-01-02', hrvMs: 60 }), // +20% sobre a base
    ]);
    // hrvScore = clamp(50 + (10/50)*200) = 90 — sem sono/passos/fc, os outros ficam neutros (70)
    // weighted = 70*0.35 + 90*0.30 + 70*0.20 + 70*0.15 = 24.5+27+14+10.5 = 76
    expect(score).toBe(76);
  });

  it('pontua FC de repouso mais baixa que a linha de base como melhor (é bom sinal)', () => {
    const score = computeMaverickScore([
      entry({ entryDate: '2024-01-01', restingHr: 60 }),
      entry({ entryDate: '2024-01-02', restingHr: 48 }), // -20% sobre a base — recuperação melhor
    ]);
    // restingHrScore = clamp(50 - ((48-60)/60)*200) = clamp(50 + 40) = 90
    // weighted = 70*0.35 (sono neutro) + 70*0.30 (hrv neutro) + 90*0.20 + 70*0.15 (passos neutro) = 74
    expect(score).toBe(74);
  });

  it('nunca extrapola o intervalo 0-100 mesmo com desvios extremos', () => {
    const score = computeMaverickScore([
      entry({ entryDate: '2024-01-01', sleepHours: 1, steps: 100, hrvMs: 20, restingHr: 100 }),
    ]);
    expect(score).not.toBeNull();
    expect(score as number).toBeGreaterThanOrEqual(0);
    expect(score as number).toBeLessThanOrEqual(100);
  });

  it('usa sempre o registro mais recente como referência, independente da ordem de entrada', () => {
    const desc = computeMaverickScore([
      entry({ entryDate: '2024-01-02', sleepHours: 8, steps: 8000 }),
      entry({ entryDate: '2024-01-01', sleepHours: 4, steps: 4000 }),
    ]);
    const asc = computeMaverickScore([
      entry({ entryDate: '2024-01-01', sleepHours: 4, steps: 4000 }),
      entry({ entryDate: '2024-01-02', sleepHours: 8, steps: 8000 }),
    ]);
    expect(desc).toBe(asc);
  });
});

describe('deriveInsight', () => {
  it('orienta a registrar dados quando não há score ainda', () => {
    expect(deriveInsight(null)).toMatch(/Registre seu sono/);
  });

  it('sugere treino de maior intensidade a partir de 75', () => {
    expect(deriveInsight(75)).toMatch(/favorável para um treino de maior intensidade/);
    expect(deriveInsight(100)).toMatch(/favorável para um treino de maior intensidade/);
  });

  it('sugere intensidade normal entre 50 e 74', () => {
    expect(deriveInsight(50)).toMatch(/intensidade normal/);
    expect(deriveInsight(74)).toMatch(/intensidade normal/);
  });

  it('sugere treino leve ou descanso abaixo de 50', () => {
    expect(deriveInsight(49)).toMatch(/treino leve ou um dia de descanso/);
    expect(deriveInsight(0)).toMatch(/treino leve ou um dia de descanso/);
  });
});
