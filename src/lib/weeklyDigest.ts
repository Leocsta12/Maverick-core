import { currentAndPreviousWeek, estimateMaxHeartrate, weekStart, weeklyLoadSummary, type WeeklyLoad } from './trainingLoad';
import { weeklyVolumeByMuscleGroup, type WeeklyMuscleVolume } from './muscleVolume';
import { computeMaverickScore, listHealthEntries, type HealthEntry } from './health';
import { listMealDatesSince } from './nutrition';
import { listStravaActivities } from './strava';
import { listRecentLoggedSets } from './workouts';

/**
 * Maverick Relatório Semanal — sintetiza carga de treino, volume de
 * musculação, consistência de nutrição e prontidão numa visão só por
 * semana. Complementa as notificações proativas (que só avisam sobre
 * problema pontual — ver supabase/functions/notify-athletes): aqui é a
 * visão de tendência, pra olhar de vez em quando e entender "como foi a
 * semana", não "o que está errado agora".
 *
 * De propósito reaproveita só funções PURAS já testadas de outros módulos
 * (currentAndPreviousWeek, weekStart, computeMaverickScore) — este
 * arquivo não faz nenhuma chamada de rede; quem busca os dados brutos é a
 * camada de dados (workouts.ts/nutrition.ts/health.ts), que monta o
 * input aqui.
 */

export type TrendDirection = 'subindo' | 'estavel' | 'caindo';

export const TREND_LABELS: Record<TrendDirection, string> = {
  subindo: '↑ subindo',
  estavel: '→ estável',
  caindo: '↓ caindo',
};

/**
 * Variação percentual dentro de `tolerancePct` conta como "estável" — sem
 * isso, qualquer ruído de semana pra semana (ex: 10 séries pra 11) viraria
 * "subindo", o que não é uma leitura útil. Sem dado suficiente (algum lado
 * null, ou base zero) também é "estável" — não dá pra afirmar tendência
 * nenhuma sem os dois pontos.
 */
export function trendDirection(current: number | null, previous: number | null, tolerancePct = 8): TrendDirection {
  if (current == null || previous == null || previous === 0) return 'estavel';
  const changePct = ((current - previous) / previous) * 100;
  if (changePct > tolerancePct) return 'subindo';
  if (changePct < -tolerancePct) return 'caindo';
  return 'estavel';
}

export type WeeklyTrend = { current: number | null; previous: number | null; trend: TrendDirection };

export type WeeklyDigest = {
  weekStartIso: string;
  load: WeeklyTrend;
  /** Total de séries de trabalho (todos os grupos musculares somados) na semana. */
  volume: WeeklyTrend;
  readiness: WeeklyTrend;
  nutritionAdherence: { daysLogged: number; totalDays: number };
};

function totalSets(week: WeeklyMuscleVolume | null): number | null {
  if (!week) return null;
  return Object.values(week.setsByMuscle).reduce((a, b) => a + b, 0);
}

// Segunda = 1 dia decorrido, domingo = 7 — quantos dias da semana atual já
// passaram (incluindo hoje), pra não cobrar consistência de dias que
// ainda nem aconteceram (mesmo raciocínio de currentAndPreviousWeek: não
// inventar um número artificial sem base real).
function daysElapsedThisWeek(now: Date): number {
  const day = now.getDay();
  return day === 0 ? 7 : day;
}

// Score médio de prontidão dentro de uma janela de datas [startIso,
// endIsoExclusive) — calcula o score PARA CADA DIA com entrada na janela,
// sempre usando o histórico até aquele dia como base (mesma regra de
// computeMaverickScore: o score é sempre "do dia mais recente passado"),
// e tira a média. O(n²) em número de entradas, mas o histórico é sempre
// pequeno (algumas dezenas de dias) — sem necessidade de otimizar.
function averageReadinessInWindow(sortedEntries: HealthEntry[], startIso: string, endIsoExclusive: string): number | null {
  const daysInWindow = sortedEntries.filter((e) => e.entryDate >= startIso && e.entryDate < endIsoExclusive);
  if (daysInWindow.length === 0) return null;

  const scores = daysInWindow
    .map((day) => computeMaverickScore(sortedEntries.filter((e) => e.entryDate <= day.entryDate)))
    .filter((s): s is number => s != null);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function buildWeeklyDigest(input: {
  loadWeeks: WeeklyLoad[];
  volumeWeeks: WeeklyMuscleVolume[];
  /** Datas (yyyy-mm-dd) já deduplicadas de qualquer refeição registrada nesta semana. */
  mealDatesThisWeek: string[];
  /** Histórico de Health em qualquer ordem — usado pra tendência de prontidão. */
  healthEntries: HealthEntry[];
  now?: Date;
}): WeeklyDigest {
  const now = input.now ?? new Date();
  const thisWeekStart = weekStart(now);
  const thisWeekStartIso = thisWeekStart.toISOString().slice(0, 10);
  const nextWeekStartIso = new Date(thisWeekStart.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const lastWeekStartIso = new Date(thisWeekStart.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);

  const { thisWeek: loadThis, lastWeek: loadLast } = currentAndPreviousWeek(input.loadWeeks, now);
  const { thisWeek: volThis, lastWeek: volLast } = currentAndPreviousWeek(input.volumeWeeks, now);

  const volumeCurrent = totalSets(volThis);
  const volumePrevious = totalSets(volLast);

  const sortedEntries = [...input.healthEntries].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  const readinessCurrent = averageReadinessInWindow(sortedEntries, thisWeekStartIso, nextWeekStartIso);
  const readinessPrevious = averageReadinessInWindow(sortedEntries, lastWeekStartIso, thisWeekStartIso);

  const daysLogged = new Set(input.mealDatesThisWeek.filter((d) => d >= thisWeekStartIso && d < nextWeekStartIso)).size;

  return {
    weekStartIso: thisWeekStartIso,
    load: { current: loadThis?.totalLoad ?? null, previous: loadLast?.totalLoad ?? null, trend: trendDirection(loadThis?.totalLoad ?? null, loadLast?.totalLoad ?? null) },
    volume: { current: volumeCurrent, previous: volumePrevious, trend: trendDirection(volumeCurrent, volumePrevious) },
    readiness: { current: readinessCurrent, previous: readinessPrevious, trend: trendDirection(readinessCurrent, readinessPrevious) },
    nutritionAdherence: { daysLogged, totalDays: daysElapsedThisWeek(now) },
  };
}

// Busca tudo que buildWeeklyDigest precisa e monta o relatório do usuário
// logado. 21 dias de janela cobre a semana atual + anterior com folga —
// mesma lógica de getAthleteOverview (coachOverview.ts): busca em
// paralelo, cada fonte falha isolada (atleta pode nunca ter conectado
// Strava, por exemplo) sem derrubar o relatório inteiro.
export async function getWeeklyDigestForUser(userId: string): Promise<WeeklyDigest> {
  const since = new Date();
  since.setDate(since.getDate() - 21);
  const sinceIso = since.toISOString().slice(0, 10);

  const [activities, loggedSets, mealDates, healthEntries] = await Promise.all([
    listStravaActivities(userId, 60).catch(() => []),
    listRecentLoggedSets(userId, 21).catch(() => []),
    listMealDatesSince(userId, sinceIso).catch(() => []),
    listHealthEntries(userId, 30).catch(() => []),
  ]);

  const maxHr = estimateMaxHeartrate(activities);
  const loadWeeks = maxHr != null ? weeklyLoadSummary(activities, maxHr) : [];
  const volumeWeeks = weeklyVolumeByMuscleGroup(loggedSets);

  return buildWeeklyDigest({ loadWeeks, volumeWeeks, mealDatesThisWeek: mealDates, healthEntries });
}
