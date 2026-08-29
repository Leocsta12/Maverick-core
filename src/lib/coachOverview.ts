import { computeMaverickScore, listHealthEntries } from './health';
import { getLatestCompletionDate } from './mission';
import { getLatestLogDate, getRecentAverageRpe } from './workouts';
import { getLatestMealDate } from './nutrition';
import { listStravaActivities } from './strava';
import { acuteChronicRatio, estimateMaxHeartrate, weeklyLoadSummary, type LoadRisk } from './trainingLoad';
import { detectDeloadStatus } from './periodization';
import { computeReadiness } from './readiness';
import { listPainEntries } from './painLog';

/**
 * Maverick Coach — painel de todos os atletas. "Check-in" aqui não é uma
 * ação própria (o app não tem um botão "check-in") — é a data mais recente
 * de QUALQUER atividade registrada pelo atleta em qualquer módulo (Health,
 * Treinos, Hábitos, Nutrition). É um proxy honesto de "essa pessoa ainda
 * está usando o app e cuidando disso", sem exigir que ela faça mais uma
 * coisa manual só pra avisar o treinador que está ativa.
 *
 * A partir daqui, o overview também carrega os sinais de RISCO DE TREINO
 * (ACWR, deload, prontidão) — pensado pro painel agregado de todos os
 * atletas (ver athleteRiskStatus): "quem está sem usar o app" (check-in)
 * é uma dimensão diferente de "quem está treinando de um jeito arriscado"
 * (risco) — um atleta pode estar super ativo E em risco de lesão ao mesmo
 * tempo, por isso as duas ficam separadas em vez de viraram um score só.
 */

export type AthleteOverview = {
  score: number | null;
  lastCheckInDate: string | null; // 'YYYY-MM-DD'
  readinessScore: number | null;
  acwrRisk: LoadRisk | null;
  deloadRecommended: boolean;
  /** Registros de dor com severidade >= 7 (ver painLog.ts) nos últimos 14 dias. */
  recentSeverePainCount: number;
};

const SEVERE_PAIN_THRESHOLD = 7;
const RECENT_PAIN_WINDOW_DAYS = 14;

export async function getAthleteOverview(athleteId: string): Promise<AthleteOverview> {
  const [healthEntries, missionDate, workoutDate, nutritionDate, activities, recentAvgRpe, painEntries] = await Promise.all([
    listHealthEntries(athleteId, 30),
    getLatestCompletionDate(athleteId),
    getLatestLogDate(athleteId),
    getLatestMealDate(athleteId),
    listStravaActivities(athleteId, 60).catch(() => []), // atleta pode nunca ter conectado o Strava
    getRecentAverageRpe(athleteId).catch(() => null),
    listPainEntries(athleteId, 30).catch(() => []),
  ]);

  const dates = [healthEntries[0]?.entryDate, missionDate, workoutDate, nutritionDate].filter(
    (d): d is string => !!d
  );
  const lastCheckInDate = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;

  const recoveryScore = computeMaverickScore(healthEntries);
  const maxHr = estimateMaxHeartrate(activities);
  const acwrRisk: LoadRisk | null = maxHr != null ? acuteChronicRatio(activities, maxHr).risk : null;

  let deloadRecommended = false;
  if (maxHr != null) {
    const weeks = weeklyLoadSummary(activities, maxHr);
    deloadRecommended = detectDeloadStatus(
      weeks.map((w) => ({ weekStartIso: w.weekStartIso, totalLoad: w.totalLoad })),
      acwrRisk
    ).recommended;
  }

  const readiness = computeReadiness({ recoveryScore, acwrRisk, recentAvgRpe });

  const recentSeverePainCount = painEntries.filter(
    (p) => p.severity >= SEVERE_PAIN_THRESHOLD && daysSince(p.entryDate) <= RECENT_PAIN_WINDOW_DAYS
  ).length;

  return {
    score: recoveryScore,
    lastCheckInDate,
    readinessScore: readiness.score,
    acwrRisk,
    deloadRecommended,
    recentSeverePainCount,
  };
}

export function daysSince(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateIso}T00:00:00`);
  return Math.round((today.getTime() - date.getTime()) / 86_400_000);
}

export type CheckInSeverity = 'ok' | 'warn' | 'stale' | 'none';

export function checkInStatus(lastCheckInDate: string | null): { label: string; severity: CheckInSeverity } {
  if (!lastCheckInDate) return { label: 'Sem atividade registrada', severity: 'none' };

  const days = daysSince(lastCheckInDate);
  if (days <= 0) return { label: 'Check-in hoje', severity: 'ok' };
  if (days === 1) return { label: 'Check-in ontem', severity: 'ok' };
  if (days <= 3) return { label: `Check-in há ${days} dias`, severity: 'warn' };
  return { label: `Sem check-in há ${days} dias`, severity: 'stale' };
}

export type TrainingRiskSeverity = 'alto' | 'atencao' | 'ok' | 'sem_dado';

/**
 * Dimensão separada do check-in — um atleta pode estar super ativo no app
 * (check-in "ok") e ainda assim treinando de um jeito arriscado (ACWR
 * alto, deload atrasado). Prioriza o sinal mais grave quando mais de um
 * bate ao mesmo tempo.
 */
export function athleteRiskStatus(overview: AthleteOverview): { label: string; severity: TrainingRiskSeverity } {
  if (overview.acwrRisk == null) return { label: 'Sem dado de treino suficiente', severity: 'sem_dado' };
  if (overview.acwrRisk === 'alto') return { label: 'Risco de carga alto', severity: 'alto' };
  if (overview.deloadRecommended) return { label: 'Deload recomendado', severity: 'atencao' };
  if (overview.acwrRisk === 'atencao') return { label: 'Carga subindo rápido', severity: 'atencao' };
  return { label: 'Carga em dia', severity: 'ok' };
}

export type PainFlagSeverity = 'alto' | 'nenhum';

/**
 * Terceira dimensão do painel — dor de verdade JÁ ACONTECEU, diferente do
 * risco de carga (que é uma previsão baseada em ACWR/deload). É o sinal
 * mais concreto que existe pra validar se os alertas de risco estão
 * funcionando (ver src/lib/painLog.ts) — por isso pesa mais que risco
 * previsto no attentionRank abaixo.
 */
export function painFlagStatus(overview: AthleteOverview): { label: string; severity: PainFlagSeverity } {
  if (overview.recentSeverePainCount === 0) return { label: 'Sem dor forte recente', severity: 'nenhum' };
  return {
    label: `${overview.recentSeverePainCount} registro${overview.recentSeverePainCount > 1 ? 's' : ''} de dor forte`,
    severity: 'alto',
  };
}

/**
 * Prioridade única pra ordenar o painel de todos os atletas — combina as
 * três dimensões (dor relatada, risco de treino previsto e engajamento).
 * Dor forte já relatada vem em primeiro lugar: é o sinal mais concreto
 * que existe, não uma previsão. Risco de carga alto vem antes até de
 * "sumiu do app": é o segundo sinal mais próximo de "pode se machucar",
 * o que importa mais pro treinador do que "não abriu o app". Maior
 * número = mais urgente.
 */
export function attentionRank(overview: AthleteOverview): number {
  const pain = painFlagStatus(overview).severity;
  const risk = athleteRiskStatus(overview).severity;
  const checkIn = checkInStatus(overview.lastCheckInDate).severity;
  if (pain === 'alto') return 5;
  if (risk === 'alto') return 4;
  if (checkIn === 'stale') return 3;
  if (risk === 'atencao') return 2;
  if (checkIn === 'warn') return 1;
  return 0;
}
