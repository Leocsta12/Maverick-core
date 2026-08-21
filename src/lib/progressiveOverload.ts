/**
 * Maverick Treinos — sugestão de progressão de carga.
 *
 * Combina duas fontes de sinal que o atleta já registra (nenhum dado
 * novo pra pedir):
 *  - "dupla progressão" clássica: bateu o TOPO da faixa de reps prescrita
 *    em todas as séries → hora de subir carga. É o método padrão usado
 *    por praticamente todo programa de hipertrofia/força.
 *  - RPE (esforço percebido) como confirmação/veto: mesmo batendo a faixa
 *    de reps, se o RPE médio veio muito alto (perto da falha), NÃO sugere
 *    subir — o corpo já avisou que tava difícil. E se ficou abaixo da
 *    faixa mínima de reps, sugere reduzir, independente do RPE.
 *
 * RPE é opcional — sem ele, cai só na dupla progressão (reps vs. faixa).
 */

export type LoggedSet = {
  repsDone: number | null;
  weightKg: number | null;
  rpe: number | null;
};

export type RepRange = { min: number; max: number };

/**
 * Interpreta o texto livre de reps do plano ("8-12", "10", "AMRAP", "até a
 * falha") num intervalo numérico comparável. Formatos que não são um
 * número nem uma faixa numérica voltam `null` — não dá pra comparar
 * "AMRAP" com uma contagem de reps feitas.
 */
export function parseRepsTarget(reps: string | null): RepRange | null {
  if (!reps) return null;
  const trimmed = reps.trim();

  const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    return min <= max ? { min, max } : { min: max, max: min };
  }

  const singleMatch = trimmed.match(/^(\d+)$/);
  if (singleMatch) {
    const n = Number(singleMatch[1]);
    return { min: n, max: n };
  }

  return null;
}

export type OverloadAction = 'aumentar' | 'manter' | 'reduzir' | 'sem_dado';

export type OverloadSuggestion = {
  action: OverloadAction;
  message: string;
  suggestedWeightKg: number | null;
};

// Grupos musculares grandes toleram (e precisam de) saltos de carga
// maiores do que isolação de grupos pequenos — mesma lógica que qualquer
// treinador usa na prática (agachamento sobe de 2.5 em 2.5kg ou mais,
// rosca direta sobe de 1 em 1kg).
const BIG_MUSCLE_GROUPS = new Set(['Pernas', 'Costas', 'Glúteos']);

function suggestedIncrement(currentWeight: number, muscleGroup: string | null): number {
  const isBig = muscleGroup != null && BIG_MUSCLE_GROUPS.has(muscleGroup);
  const pct = isBig ? 0.05 : 0.025;
  const step = isBig ? 2.5 : 1;
  return Math.max(step, Math.round((currentWeight * pct) / step) * step);
}

/**
 * `lastSets` são as séries da ÚLTIMA vez que o atleta fez esse exercício
 * (não as de hoje, ainda em branco) — é sobre elas que a sugestão pra
 * HOJE se baseia. `targetReps` vem de `parseRepsTarget` do texto do
 * plano; `muscleGroup` só afeta o TAMANHO do incremento sugerido.
 */
export function suggestProgression(
  lastSets: LoggedSet[],
  targetReps: RepRange | null,
  muscleGroup: string | null = null
): OverloadSuggestion {
  const valid = lastSets.filter((s) => s.repsDone != null && s.weightKg != null);
  if (valid.length === 0) {
    return {
      action: 'sem_dado',
      message: 'Registre a última sessão desse exercício pra receber uma sugestão de carga.',
      suggestedWeightKg: null,
    };
  }

  const avgReps = valid.reduce((sum, s) => sum + (s.repsDone as number), 0) / valid.length;
  // Última série registrada = a carga de trabalho de referência pra sugerir em cima.
  const lastWeight = valid[valid.length - 1].weightKg as number;
  const rpeValues = valid.map((s) => s.rpe).filter((r): r is number => r != null);
  const avgRpe = rpeValues.length > 0 ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length : null;

  const hitTop = targetReps != null ? avgReps >= targetReps.max : null;
  const missedBottom = targetReps != null ? avgReps < targetReps.min : null;

  // Ficou abaixo da faixa mínima, ou RPE quase na falha (>=9.5) — não é
  // hora de subir, e sim de segurar ou recuar um pouco.
  if (missedBottom === true || (avgRpe != null && avgRpe >= 9.5)) {
    const suggested = Math.max(0, lastWeight - suggestedIncrement(lastWeight, muscleGroup));
    return {
      action: 'reduzir',
      message:
        missedBottom === true
          ? `Ficou abaixo da faixa de reps na última sessão — considere ${suggested}kg pra recuperar a técnica.`
          : `RPE muito alto na última sessão — considere ${suggested}kg pra essa série.`,
      suggestedWeightKg: suggested,
    };
  }

  // Dupla progressão: bateu o topo da faixa de reps (ou não há faixa mas o
  // RPE veio baixo) — hora de subir carga. RPE alto sem faixa detectável
  // não é suficiente sozinho pra segurar, porque hitTop==null nesse caso.
  const easyEffort = avgRpe != null ? avgRpe <= 7 : null;
  const shouldIncrease = hitTop === true ? avgRpe == null || easyEffort === true : easyEffort === true && targetReps == null;
  if (shouldIncrease) {
    const suggested = lastWeight + suggestedIncrement(lastWeight, muscleGroup);
    return {
      action: 'aumentar',
      message: `Bateu a faixa de reps${avgRpe != null ? ' com folga (RPE baixo)' : ''} — suba pra ${suggested}kg na próxima.`,
      suggestedWeightKg: suggested,
    };
  }

  return {
    action: 'manter',
    message: `Carga no ponto certo (${lastWeight}kg) — mantenha e busque mais uma repetição antes de subir.`,
    suggestedWeightKg: lastWeight,
  };
}
