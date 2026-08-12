import { computeMaverickScore, listHealthEntries } from './health';
import { getLatestCompletionDate } from './mission';
import { getLatestLogDate } from './workouts';
import { getLatestMealDate } from './nutrition';

/**
 * Maverick Coach — painel de todos os atletas. "Check-in" aqui não é uma
 * ação própria (o app não tem um botão "check-in") — é a data mais recente
 * de QUALQUER atividade registrada pelo atleta em qualquer módulo (Health,
 * Treinos, Hábitos, Nutrition). É um proxy honesto de "essa pessoa ainda
 * está usando o app e cuidando disso", sem exigir que ela faça mais uma
 * coisa manual só pra avisar o treinador que está ativa.
 */

export type AthleteOverview = {
  score: number | null;
  lastCheckInDate: string | null; // 'YYYY-MM-DD'
};

export async function getAthleteOverview(athleteId: string): Promise<AthleteOverview> {
  const [healthEntries, missionDate, workoutDate, nutritionDate] = await Promise.all([
    listHealthEntries(athleteId, 30),
    getLatestCompletionDate(athleteId),
    getLatestLogDate(athleteId),
    getLatestMealDate(athleteId),
  ]);

  const dates = [healthEntries[0]?.entryDate, missionDate, workoutDate, nutritionDate].filter(
    (d): d is string => !!d
  );
  const lastCheckInDate = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;

  return { score: computeMaverickScore(healthEntries), lastCheckInDate };
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
