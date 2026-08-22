/**
 * Maverick Nutrition — fueling de performance.
 *
 * As metas diárias fixas (src/lib/nutrition.ts) continuam existindo pra
 * quem quer um número estável pra mirar. Isso aqui é um COMPLEMENTO: uma
 * sugestão que muda com o treino do dia, seguindo o princípio central da
 * nutrição esportiva (diretrizes ACSM/IOC de periodização de
 * carboidrato) — carboidrato é o macro que mais varia com o volume de
 * treino; proteína fica relativamente estável por kg; gordura preenche o
 * resto. Nunca sobrescreve a meta manual do atleta — é só uma segunda
 * leitura, ele decide se usa.
 */

export type TrainingLoadTier = 'descanso' | 'leve' | 'moderado' | 'alto' | 'muito_alto';

export const TIER_LABELS: Record<TrainingLoadTier, string> = {
  descanso: 'Dia de descanso',
  leve: 'Treino leve',
  moderado: 'Treino moderado',
  alto: 'Treino pesado',
  muito_alto: 'Treino muito pesado / dia de prova',
};

/** Faixas de minutos de treino no dia — baseado nas faixas de carboidrato do IOC (leve/moderado/alto/muito alto volume). */
export function classifyTrainingMinutes(minutes: number): TrainingLoadTier {
  if (minutes <= 0) return 'descanso';
  if (minutes <= 60) return 'leve';
  if (minutes <= 120) return 'moderado';
  if (minutes <= 240) return 'alto';
  return 'muito_alto';
}

// g de carboidrato por kg de peso corporal, por tier — ponto médio das
// faixas recomendadas pelas diretrizes de nutrição esportiva (ACSM/IOC)
// pra cada nível de volume/intensidade de treino no dia.
const CARBS_G_PER_KG: Record<TrainingLoadTier, number> = {
  descanso: 3,
  leve: 4,
  moderado: 6,
  alto: 8,
  muito_alto: 10,
};

// Meio-termo pra treino concorrente (força + endurance) — a literatura
// sugere uma faixa de 1.6-2.2g/kg; não varia por tier porque a
// necessidade de proteína é sobre o total diário/semanal, não sobre o
// volume de UM treino específico (diferente do carboidrato).
const PROTEIN_G_PER_KG = 1.8;

// Piso de gordura — abaixo disso prejudica produção hormonal; o resto da
// caloria "sobra" pra gordura depois de proteína e carboidrato definidos.
const MIN_FAT_G_PER_KG = 0.6;

const WATER_ML_PER_KG = 35;
// Estimativa conservadora de perda por suor — varia bastante por pessoa,
// calor e intensidade; é uma média populacional, não uma medição real.
const WATER_ML_PER_TRAINING_HOUR = 600;

// Sessão de musculação não tem duração registrada no schema hoje (só
// completed: boolean) — estimativa fixa de 60min por sessão concluída,
// documentada aqui em vez de espalhada pela UI.
export const STRENGTH_SESSION_ESTIMATE_MIN = 60;

export function estimateTodayTrainingMinutes(todayStravaMinutes: number, hasCompletedStrengthToday: boolean): number {
  return todayStravaMinutes + (hasCompletedStrengthToday ? STRENGTH_SESSION_ESTIMATE_MIN : 0);
}

export type PerformanceTargets = {
  tier: TrainingLoadTier;
  proteinG: number;
  carbsG: number;
  fatG: number;
  calories: number;
  waterMl: number;
};

export function computePerformanceTargets(weightKg: number, todayTrainingMinutes: number): PerformanceTargets {
  const tier = classifyTrainingMinutes(todayTrainingMinutes);

  const proteinG = Math.round(weightKg * PROTEIN_G_PER_KG);
  const carbsG = Math.round(weightKg * CARBS_G_PER_KG[tier]);
  const fatG = Math.round(weightKg * MIN_FAT_G_PER_KG);

  const calories = Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
  const waterMl = Math.round(weightKg * WATER_ML_PER_KG + (todayTrainingMinutes / 60) * WATER_ML_PER_TRAINING_HOUR);

  return { tier, proteinG, carbsG, fatG, calories, waterMl };
}
