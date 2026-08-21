// Testes de src/lib/progressiveOverload.ts — parseRepsTarget e
// suggestProgression. A matriz de decisão (RPE × faixa de reps) é onde um
// bug realmente importaria (sugerir subir carga quando devia reduzir é o
// pior cenário possível aqui), então cobre todos os ramos de propósito.

import { parseRepsTarget, suggestProgression, type LoggedSet } from '../progressiveOverload';

describe('parseRepsTarget', () => {
  it('interpreta uma faixa "8-12"', () => {
    expect(parseRepsTarget('8-12')).toEqual({ min: 8, max: 12 });
  });

  it('tolera espaços em volta do traço e das pontas', () => {
    expect(parseRepsTarget(' 8 - 12 ')).toEqual({ min: 8, max: 12 });
  });

  it('inverte a faixa se vier ao contrário ("12-8")', () => {
    expect(parseRepsTarget('12-8')).toEqual({ min: 8, max: 12 });
  });

  it('interpreta um número único como faixa de um ponto só', () => {
    expect(parseRepsTarget('10')).toEqual({ min: 10, max: 10 });
  });

  it('retorna null pra texto não numérico (AMRAP, "até a falha")', () => {
    expect(parseRepsTarget('AMRAP')).toBeNull();
    expect(parseRepsTarget('até a falha')).toBeNull();
  });

  it('retorna null pra vazio ou ausente', () => {
    expect(parseRepsTarget('')).toBeNull();
    expect(parseRepsTarget(null)).toBeNull();
  });
});

describe('suggestProgression', () => {
  const set = (repsDone: number | null, weightKg: number | null, rpe: number | null = null): LoggedSet => ({
    repsDone,
    weightKg,
    rpe,
  });

  it('retorna "sem_dado" quando não há nenhuma série válida (sem reps ou sem peso)', () => {
    expect(suggestProgression([], { min: 8, max: 12 }).action).toBe('sem_dado');
    expect(suggestProgression([set(null, 40)], { min: 8, max: 12 }).action).toBe('sem_dado');
    expect(suggestProgression([set(10, null)], { min: 8, max: 12 }).action).toBe('sem_dado');
  });

  it('sugere reduzir quando ficou abaixo da faixa mínima de reps, mesmo sem RPE', () => {
    const result = suggestProgression([set(6, 40), set(5, 40)], { min: 8, max: 12 });
    expect(result.action).toBe('reduzir');
    expect(result.suggestedWeightKg).toBeLessThan(40);
  });

  it('sugere reduzir quando RPE médio é muito alto (>=9.5), mesmo batendo a faixa de reps', () => {
    const result = suggestProgression([set(12, 40, 10), set(12, 40, 9.5)], { min: 8, max: 12 });
    expect(result.action).toBe('reduzir');
  });

  it('sugere aumentar quando bate o topo da faixa de reps, sem RPE registrado (dupla progressão pura)', () => {
    const result = suggestProgression([set(12, 40), set(12, 40)], { min: 8, max: 12 });
    expect(result.action).toBe('aumentar');
    expect(result.suggestedWeightKg).toBeGreaterThan(40);
  });

  it('sugere aumentar quando bate o topo da faixa e o RPE veio baixo (<=7)', () => {
    const result = suggestProgression([set(12, 40, 6), set(12, 40, 7)], { min: 8, max: 12 });
    expect(result.action).toBe('aumentar');
    expect(result.message).toContain('RPE baixo');
  });

  it('sugere manter quando bate o topo da faixa mas o RPE veio alto (~9), sem chegar em 9.5', () => {
    const result = suggestProgression([set(12, 40, 9), set(12, 40, 9)], { min: 8, max: 12 });
    expect(result.action).toBe('manter');
  });

  it('sugere manter quando fica dentro da faixa mas não no topo, mesmo com RPE baixo (double progression: só sobe no topo)', () => {
    const result = suggestProgression([set(9, 40, 6)], { min: 8, max: 12 });
    expect(result.action).toBe('manter');
  });

  it('sem faixa de reps interpretável, usa só o RPE: baixo -> aumentar', () => {
    const result = suggestProgression([set(8, 40, 6)], null);
    expect(result.action).toBe('aumentar');
  });

  it('sem faixa de reps interpretável, usa só o RPE: alto (>=9.5) -> reduzir', () => {
    const result = suggestProgression([set(8, 40, 9.7)], null);
    expect(result.action).toBe('reduzir');
  });

  it('sem faixa de reps e sem RPE, não há sinal nenhum pra mudar — mantém', () => {
    const result = suggestProgression([set(8, 40)], null);
    expect(result.action).toBe('manter');
    expect(result.suggestedWeightKg).toBe(40);
  });

  it('usa a última série registrada como peso de referência, não a média', () => {
    const result = suggestProgression([set(12, 30), set(12, 35), set(12, 40)], { min: 8, max: 12 });
    expect(result.suggestedWeightKg).toBeGreaterThan(40); // referência é 40 (última), não a média (35)
  });

  it('grupos musculares grandes (Pernas/Costas/Glúteos) recebem incremento maior que grupos pequenos', () => {
    const legResult = suggestProgression([set(12, 100)], { min: 8, max: 12 }, 'Pernas');
    const armResult = suggestProgression([set(12, 100)], { min: 8, max: 12 }, 'Braço');
    const legIncrement = (legResult.suggestedWeightKg as number) - 100;
    const armIncrement = (armResult.suggestedWeightKg as number) - 100;
    expect(legIncrement).toBeGreaterThan(armIncrement);
  });

  it('nunca sugere peso negativo ao reduzir', () => {
    const result = suggestProgression([set(4, 0.5)], { min: 8, max: 12 });
    expect(result.action).toBe('reduzir');
    expect(result.suggestedWeightKg).toBeGreaterThanOrEqual(0);
  });

  it('incremento mínimo de 1kg pra grupos pequenos mesmo com peso baixo (evita sugerir +0kg)', () => {
    const result = suggestProgression([set(12, 10)], { min: 8, max: 12 }, 'Braço');
    expect(result.suggestedWeightKg).toBe(11);
  });
});
