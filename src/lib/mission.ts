import { supabase } from './supabase';

/**
 * Maverick Mission — checklist de hábitos com sequência (streak).
 *
 * Cada hábito guarda 1 registro por dia em que foi cumprido (upsert-friendly:
 * marcar de novo o mesmo dia não duplica). A streak é derivada no cliente a
 * partir das datas registradas — sem coluna própria, sem ficar dessincronizada.
 */

export type MissionHabit = {
  id: string;
  title: string;
  sortOrder: number;
};

export type MissionCompletion = {
  habitId: string;
  completedDate: string; // 'YYYY-MM-DD'
};

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listHabits(userId: string): Promise<MissionHabit[]> {
  const { data, error } = await supabase
    .from('mission_habits')
    .select('id, title, sort_order')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, title: row.title, sortOrder: row.sort_order }));
}

export async function addHabit(userId: string, title: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from('mission_habits')
    .insert({ user_id: userId, title: title.trim(), sort_order: sortOrder });
  if (error) throw error;
}

export async function archiveHabit(habitId: string): Promise<void> {
  const { error } = await supabase
    .from('mission_habits')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', habitId);
  if (error) throw error;
}

// Últimos `days` dias de conclusões de todos os hábitos do usuário — dá pra
// montar tanto o check de hoje quanto a streak de cada hábito com uma query só.
export async function listRecentCompletions(
  userId: string,
  days = 30
): Promise<MissionCompletion[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('mission_completions')
    .select('habit_id, completed_date')
    .eq('user_id', userId)
    .gte('completed_date', sinceIso);
  if (error) throw error;
  return (data ?? []).map((row) => ({ habitId: row.habit_id, completedDate: row.completed_date }));
}

// Data da última conclusão de qualquer hábito — usado pelo painel do Coach
// (Fase "todos os atletas") pra sinalizar quem não faz check-in há dias.
export async function getLatestCompletionDate(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('mission_completions')
    .select('completed_date')
    .eq('user_id', userId)
    .order('completed_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.completed_date ?? null;
}

export async function markDone(userId: string, habitId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from('mission_completions')
    .upsert(
      { user_id: userId, habit_id: habitId, completed_date: date },
      { onConflict: 'habit_id,completed_date' }
    );
  if (error) throw error;
}

export async function markUndone(habitId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from('mission_completions')
    .delete()
    .eq('habit_id', habitId)
    .eq('completed_date', date);
  if (error) throw error;
}

/** Dias consecutivos (terminando hoje ou ontem) em que o hábito foi cumprido. */
export function computeStreak(habitId: string, completions: MissionCompletion[]): number {
  const dates = new Set(
    completions.filter((c) => c.habitId === habitId).map((c) => c.completedDate)
  );
  if (dates.size === 0) return 0;

  const cursor = new Date();
  // Se hoje ainda não foi marcado, a streak conta a partir de ontem — assim
  // marcar tarde da noite não zera a sequência de quem já vinha cumprindo.
  if (!dates.has(todayIsoDate())) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
