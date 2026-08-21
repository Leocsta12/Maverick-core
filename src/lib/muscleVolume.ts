import { weekStart } from './trainingLoad';

/**
 * Maverick Treinos — volume semanal por grupo muscular.
 *
 * Volume aqui = SÉRIES DE TRABALHO por semana por grupo muscular — é a
 * unidade que a literatura de hipertrofia (Israetel/RP, entre outros) usa
 * pra programar, e a mais fácil de um atleta olhar e agir ("fiz só 3
 * séries de posterior essa semana, preciso subir"). Não é tonelagem
 * (séries × reps × carga) de propósito: tonelagem mistura exercícios
 * muito diferentes numa métrica só e é mais difícil de interpretar sem
 * contexto extra.
 */

export type LoggedSetEntry = {
  muscleGroup: string | null;
  /** yyyy-mm-dd — como `workout_logs.log_date` (coluna `date`, sem hora) vem do Postgres. */
  logDate: string;
};

export type WeeklyMuscleVolume = {
  weekStartIso: string;
  setsByMuscle: Record<string, number>;
};

const NO_GROUP_LABEL = 'Sem grupo';

// `workout_logs.log_date` chega como "yyyy-mm-dd", sem hora. `new
// Date('2026-08-17')` interpreta isso como meia-noite EM UTC — que em
// fusos negativos (Brasil, UTC-3) vira 21h do dia ANTERIOR quando o
// `Date` calcula dia da semana local, empurrando a série pra semana
// errada. Monta a data em horário local a partir das partes pra não cair
// nessa pegadinha (mesma classe de bug que já mordeu esse projeto antes
// com datas "só dia" vindas do Postgres).
function localDateFromIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function weeklyVolumeByMuscleGroup(entries: LoggedSetEntry[]): WeeklyMuscleVolume[] {
  const byWeek = new Map<string, WeeklyMuscleVolume>();

  for (const e of entries) {
    const group = e.muscleGroup ?? NO_GROUP_LABEL;
    const weekIso = weekStart(localDateFromIsoDate(e.logDate)).toISOString().slice(0, 10);

    const entry = byWeek.get(weekIso) ?? { weekStartIso: weekIso, setsByMuscle: {} };
    entry.setsByMuscle[group] = (entry.setsByMuscle[group] ?? 0) + 1;
    byWeek.set(weekIso, entry);
  }

  return Array.from(byWeek.values()).sort((a, b) => a.weekStartIso.localeCompare(b.weekStartIso));
}

export type VolumeTier = 'baixo' | 'moderado' | 'alto';

export const VOLUME_TIER_LABELS: Record<VolumeTier, string> = {
  baixo: 'Volume baixo',
  moderado: 'Volume adequado',
  alto: 'Volume alto',
};

/**
 * Faixas GENÉRICAS e conservadoras (não são MEV/MRV calibrados por
 * indivíduo ou por grupo muscular específico — isso varia muito demais
 * pra generalizar sem dado nenhum de recuperação) — servem só como
 * referência ampla pra chamar atenção de extremos, não como prescrição.
 */
export function volumeTier(sets: number): VolumeTier {
  if (sets < 4) return 'baixo';
  if (sets <= 10) return 'moderado';
  return 'alto';
}
