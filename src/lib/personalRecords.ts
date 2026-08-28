/**
 * Maverick PRs — 1RM estimado e recordes pessoais a partir das séries já
 * registradas em Treinos. O 1RM real só é medido testando de verdade
 * (arriscado e raro fora de temporada), então usamos a fórmula de Epley
 * pra estimar a carga máxima teórica a partir de uma série submáxima —
 * padrão da indústria (o mesmo usado por apps tipo Strong/Hevy).
 *
 * A fórmula degrada em séries muito longas (acima de ~12 reps o erro de
 * estimativa cresce bastante — fadiga muscular deixa de ser um bom proxy
 * de força máxima) — por isso séries fora da faixa 1-12 reps não entram
 * no cálculo de recorde, ainda que a série em si continue valendo pro
 * volume/histórico nos outros módulos (muscleVolume.ts etc).
 */

export type LoggedSet = {
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  repsDone: number;
  logDate: string; // 'YYYY-MM-DD'
};

const MAX_REPS_FOR_ESTIMATE = 12;

export function estimateOneRepMax(weightKg: number, repsDone: number): number | null {
  if (weightKg <= 0 || repsDone <= 0 || repsDone > MAX_REPS_FOR_ESTIMATE) return null;
  if (repsDone === 1) return weightKg; // é o próprio 1RM, sem estimativa
  return weightKg * (1 + repsDone / 30); // fórmula de Epley
}

export type PersonalRecord = {
  exerciseId: string;
  exerciseName: string;
  estimated1RM: number;
  weightKg: number;
  repsDone: number;
  logDate: string;
};

/** Melhor 1RM estimado ATUAL por exercício, com a série que o gerou. */
export function currentPersonalRecords(sets: LoggedSet[]): PersonalRecord[] {
  const bestByExercise = new Map<string, PersonalRecord>();
  for (const set of sets) {
    const est = estimateOneRepMax(set.weightKg, set.repsDone);
    if (est == null) continue;
    const current = bestByExercise.get(set.exerciseId);
    if (!current || est > current.estimated1RM) {
      bestByExercise.set(set.exerciseId, {
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        estimated1RM: est,
        weightKg: set.weightKg,
        repsDone: set.repsDone,
        logDate: set.logDate,
      });
    }
  }
  return [...bestByExercise.values()].sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}

/**
 * Marca cada série que, na hora em que foi feita, bateu o recorde de
 * todas as séries anteriores daquele exercício (empate não conta como
 * novo recorde). Alimenta uma linha do tempo de "quando os PRs
 * aconteceram" — não só o recorde atual. Assume `sets` já em ordem
 * cronológica crescente (mais antiga primeiro).
 */
export function detectPrHistory(sets: LoggedSet[]): PersonalRecord[] {
  const bestByExercise = new Map<string, number>();
  const prs: PersonalRecord[] = [];
  for (const set of sets) {
    const est = estimateOneRepMax(set.weightKg, set.repsDone);
    if (est == null) continue;
    const best = bestByExercise.get(set.exerciseId);
    if (best == null || est > best) {
      bestByExercise.set(set.exerciseId, est);
      prs.push({
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        estimated1RM: est,
        weightKg: set.weightKg,
        repsDone: set.repsDone,
        logDate: set.logDate,
      });
    }
  }
  return prs;
}

/**
 * Checa se UMA série recém-salva é um novo recorde, comparando com o
 * histórico anterior (sem incluir a própria série nova). Usado no
 * SetLogger pra celebrar na hora, sem recalcular tudo — só olha pro
 * melhor 1RM já visto daquele exercício específico.
 */
export function isNewPersonalRecord(priorSets: LoggedSet[], newSet: LoggedSet): boolean {
  const est = estimateOneRepMax(newSet.weightKg, newSet.repsDone);
  if (est == null) return false;
  const priorBest = currentPersonalRecords(priorSets.filter((s) => s.exerciseId === newSet.exerciseId))[0];
  return !priorBest || est > priorBest.estimated1RM;
}
