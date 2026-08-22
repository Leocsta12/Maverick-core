// Testes de src/lib/performanceNutrition.ts. O que mais importa: os
// limites de tier (minutos de treino → faixa de carboidrato) e a
// matemática de gramas/calorias/água ficarem consistentes e verificáveis
// à mão.

import {
  classifyTrainingMinutes,
  computePerformanceTargets,
  estimateTodayTrainingMinutes,
  STRENGTH_SESSION_ESTIMATE_MIN,
} from '../performanceNutrition';

describe('classifyTrainingMinutes', () => {
  it('0 minutos ou menos é dia de descanso', () => {
    expect(classifyTrainingMinutes(0)).toBe('descanso');
    expect(classifyTrainingMinutes(-5)).toBe('descanso');
  });

  it('até 60 minutos é treino leve', () => {
    expect(classifyTrainingMinutes(1)).toBe('leve');
    expect(classifyTrainingMinutes(60)).toBe('leve');
  });

  it('de 61 a 120 minutos é treino moderado', () => {
    expect(classifyTrainingMinutes(61)).toBe('moderado');
    expect(classifyTrainingMinutes(120)).toBe('moderado');
  });

  it('de 121 a 240 minutos é treino pesado (alto)', () => {
    expect(classifyTrainingMinutes(121)).toBe('alto');
    expect(classifyTrainingMinutes(240)).toBe('alto');
  });

  it('acima de 240 minutos é muito pesado', () => {
    expect(classifyTrainingMinutes(241)).toBe('muito_alto');
    expect(classifyTrainingMinutes(600)).toBe('muito_alto');
  });
});

describe('estimateTodayTrainingMinutes', () => {
  it('soma os minutos do Strava com a estimativa fixa de sessão de força quando houve musculação hoje', () => {
    expect(estimateTodayTrainingMinutes(30, true)).toBe(30 + STRENGTH_SESSION_ESTIMATE_MIN);
  });

  it('sem musculação hoje, usa só os minutos do Strava', () => {
    expect(estimateTodayTrainingMinutes(45, false)).toBe(45);
  });

  it('sem nada registrado hoje (nem Strava nem força), dá zero', () => {
    expect(estimateTodayTrainingMinutes(0, false)).toBe(0);
  });
});

describe('computePerformanceTargets', () => {
  it('num dia de descanso, sugere carboidrato baixo (3g/kg) e não conta água extra de treino', () => {
    const result = computePerformanceTargets(70, 0);
    expect(result.tier).toBe('descanso');
    expect(result.carbsG).toBe(210); // 70 * 3
    expect(result.proteinG).toBe(126); // 70 * 1.8
    expect(result.waterMl).toBe(2450); // 70 * 35 + 0
  });

  it('num dia de treino muito pesado, sugere carboidrato alto (10g/kg) e mais água', () => {
    const result = computePerformanceTargets(70, 300); // 5h de treino
    expect(result.tier).toBe('muito_alto');
    expect(result.carbsG).toBe(700); // 70 * 10
    expect(result.waterMl).toBe(2450 + 3000); // base + 5h * 600ml/h
  });

  it('a proteína não muda entre um dia de descanso e um dia de treino pesado (mesma pessoa)', () => {
    const descanso = computePerformanceTargets(70, 0);
    const pesado = computePerformanceTargets(70, 200);
    expect(descanso.proteinG).toBe(pesado.proteinG);
  });

  it('calorias totais batem com a soma dos macros (4/4/9 kcal por g)', () => {
    const result = computePerformanceTargets(80, 90);
    const expectedCalories = result.proteinG * 4 + result.carbsG * 4 + result.fatG * 9;
    expect(result.calories).toBe(expectedCalories);
  });

  it('gordura escala com o peso corporal (piso de 0.6g/kg), não com o volume de treino', () => {
    const leve = computePerformanceTargets(70, 30);
    const pesado = computePerformanceTargets(70, 200);
    expect(leve.fatG).toBe(pesado.fatG);
    expect(leve.fatG).toBe(42); // 70 * 0.6
  });
});
