import { supabase } from './supabase';

/**
 * Maverick Treinos — plano semanal de exercícios, catálogo compartilhado
 * (com foto/vídeo por exercício) e registro de execução (séries, reps,
 * carga). O treinador vinculado (accepted) pode LER e ESCREVER o plano do
 * atleta — é o único módulo onde o treinador tem escrita, porque o
 * propósito é ele montar o treino. O registro de execução em si é sempre
 * do próprio atleta (o treinador só lê, nunca marca por ele).
 */

export type Exercise = {
  id: string;
  name: string;
  muscleGroup: string | null;
  description: string | null;
  photoUrl: string | null;
  videoUrl: string | null;
};

export type AthleteLevel = 'iniciante' | 'intermediario' | 'avancado';

export type WorkoutPlan = {
  id: string;
  userId: string;
  title: string;
  level: AthleteLevel | null;
  goal: string | null;
};

export type WorkoutPlanDay = {
  id: string;
  planId: string;
  dayOfWeek: number; // 0 = domingo … 6 = sábado
  label: string;
  isRestDay: boolean;
};

export type WorkoutPlanExercise = {
  id: string;
  planDayId: string;
  exerciseId: string;
  exercise: Exercise;
  sets: number | null;
  reps: string | null;
  notes: string | null;
  sortOrder: number;
};

export type WorkoutLog = {
  id: string;
  planDayId: string;
  logDate: string;
  completed: boolean;
};

export type SetEntry = {
  setNumber: number;
  repsDone: number | null;
  weightKg: number | null;
  /** RPE (esforço percebido, escala 1-10) — opcional, alimenta a sugestão de progressão em src/lib/progressiveOverload.ts. */
  rpe: number | null;
};

/** Uma série já registrada, marcada com o grupo muscular do exercício e a data do treino — a matéria-prima de src/lib/muscleVolume.ts. */
export type LoggedSetEntry = {
  muscleGroup: string | null;
  logDate: string;
};

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function dayOfWeekName(day: number): string {
  return DAY_LABELS[day] ?? '';
}

export function todayDayOfWeek(): number {
  return new Date().getDay();
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function toExercise(row: {
  id: string;
  name: string;
  muscle_group: string | null;
  description: string | null;
  photo_path: string | null;
  video_url: string | null;
}): Exercise {
  const photoUrl = row.photo_path
    ? supabase.storage.from('exercise-media').getPublicUrl(row.photo_path).data.publicUrl
    : null;
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    description: row.description,
    photoUrl,
    videoUrl: row.video_url,
  };
}

export async function listExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group, description, photo_path, video_url')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toExercise);
}

export async function addExercise(
  userId: string,
  fields: { name: string; muscleGroup?: string; description?: string }
): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: fields.name.trim(),
      muscle_group: fields.muscleGroup?.trim() || null,
      description: fields.description?.trim() || null,
      created_by: userId,
    })
    .select('id, name, muscle_group, description, photo_path, video_url')
    .single();
  if (error) throw error;
  return toExercise(data);
}

export async function setExerciseVideoUrl(exerciseId: string, videoUrl: string): Promise<void> {
  const { error } = await supabase
    .from('exercises')
    .update({ video_url: videoUrl.trim() || null })
    .eq('id', exerciseId);
  if (error) throw error;
}

export async function uploadExercisePhoto(exerciseId: string, uri: string, mimeType: string): Promise<void> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = mimeType.split('/')[1] ?? 'jpg';
  const path = `${exerciseId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('exercise-media')
    .upload(path, blob, { contentType: mimeType, upsert: true });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase.from('exercises').update({ photo_path: path }).eq('id', exerciseId);
  if (updateError) throw updateError;
}

// Garante que o atleta tenha um plano ativo com os 7 dias criados (idempotente
// — se já existir, só devolve). createdBy é quem está chamando (o próprio
// atleta ou um treinador vinculado).
export async function getOrCreatePlan(athleteUserId: string, createdBy: string): Promise<WorkoutPlan> {
  const { data: existing, error: existingError } = await supabase
    .from('workout_plans')
    .select('id, user_id, title, level, goal')
    .eq('user_id', athleteUserId)
    .maybeSingle();
  if (existingError) throw existingError;

  let plan = existing;
  if (!plan) {
    const { data: created, error: createError } = await supabase
      .from('workout_plans')
      .insert({ user_id: athleteUserId, created_by: createdBy, title: 'Meu treino' })
      .select('id, user_id, title, level, goal')
      .single();
    if (createError) {
      // 23505 = violação da constraint unique(user_id): outra chamada (efeito
      // duplo do React, dupla montagem etc.) criou o plano entre o select e
      // o insert acima. Em vez de propagar o erro, busca de novo — idempotente.
      if (createError.code === '23505') {
        const { data: retried, error: retryError } = await supabase
          .from('workout_plans')
          .select('id, user_id, title, level, goal')
          .eq('user_id', athleteUserId)
          .single();
        if (retryError) throw retryError;
        plan = retried;
      } else {
        throw createError;
      }
    } else {
      plan = created;
    }
  }

  const { data: days, error: daysError } = await supabase
    .from('workout_plan_days')
    .select('id')
    .eq('plan_id', plan.id);
  if (daysError) throw daysError;

  if (!days || days.length < 7) {
    const rows = Array.from({ length: 7 }).map((_, dayOfWeek) => ({
      plan_id: plan!.id,
      day_of_week: dayOfWeek,
      label: '',
      is_rest_day: dayOfWeek === 0, // domingo como descanso por padrão
      sort_order: dayOfWeek,
    }));
    // upsert por (plan_id, day_of_week) evita duplicar os dias que já existem
    const { error: upsertError } = await supabase
      .from('workout_plan_days')
      .upsert(rows, { onConflict: 'plan_id,day_of_week', ignoreDuplicates: true });
    if (upsertError) throw upsertError;
  }

  return { id: plan.id, userId: plan.user_id, title: plan.title, level: plan.level, goal: plan.goal };
}

export async function listPlanDays(planId: string): Promise<WorkoutPlanDay[]> {
  const { data, error } = await supabase
    .from('workout_plan_days')
    .select('id, plan_id, day_of_week, label, is_rest_day')
    .eq('plan_id', planId)
    .order('day_of_week', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    planId: row.plan_id,
    dayOfWeek: row.day_of_week,
    label: row.label,
    isRestDay: row.is_rest_day,
  }));
}

export async function updateDay(dayId: string, fields: { label?: string; isRestDay?: boolean }): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (fields.label !== undefined) patch.label = fields.label;
  if (fields.isRestDay !== undefined) patch.is_rest_day = fields.isRestDay;
  const { error } = await supabase.from('workout_plan_days').update(patch).eq('id', dayId);
  if (error) throw error;
}

export async function listDayExercises(dayId: string): Promise<WorkoutPlanExercise[]> {
  const { data, error } = await supabase
    .from('workout_plan_exercises')
    .select(
      'id, plan_day_id, exercise_id, sets, reps, notes, sort_order, exercises (id, name, muscle_group, description, photo_path, video_url)'
    )
    .eq('plan_day_id', dayId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    planDayId: row.plan_day_id,
    exerciseId: row.exercise_id,
    exercise: toExercise(row.exercises),
    sets: row.sets,
    reps: row.reps,
    notes: row.notes,
    sortOrder: row.sort_order,
  }));
}

export async function addExerciseToDay(
  dayId: string,
  exerciseId: string,
  fields: { sets?: number; reps?: string; notes?: string },
  sortOrder: number
): Promise<void> {
  const { error } = await supabase.from('workout_plan_exercises').insert({
    plan_day_id: dayId,
    exercise_id: exerciseId,
    sets: fields.sets ?? null,
    reps: fields.reps ?? null,
    notes: fields.notes ?? null,
    sort_order: sortOrder,
  });
  if (error) throw error;
}

export async function removeExerciseFromDay(planExerciseId: string): Promise<void> {
  const { error } = await supabase.from('workout_plan_exercises').delete().eq('id', planExerciseId);
  if (error) throw error;
}

async function clearDayExercises(dayId: string): Promise<void> {
  const { error } = await supabase.from('workout_plan_exercises').delete().eq('plan_day_id', dayId);
  if (error) throw error;
}

export async function listRecentLogs(userId: string, days = 14): Promise<WorkoutLog[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('workout_logs')
    .select('id, plan_day_id, log_date, completed')
    .eq('user_id', userId)
    .gte('log_date', since.toISOString().slice(0, 10));
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    planDayId: row.plan_day_id,
    logDate: row.log_date,
    completed: row.completed,
  }));
}

// Data do último treino concluído (qualquer dia) — usado pelo painel do
// Coach (Fase "todos os atletas") pra sinalizar quem não faz check-in há dias.
export async function getLatestLogDate(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('log_date')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.log_date ?? null;
}

export async function markDayDone(userId: string, planDayId: string, logDate: string): Promise<string> {
  const { data, error } = await supabase
    .from('workout_logs')
    .upsert(
      { user_id: userId, plan_day_id: planDayId, log_date: logDate, completed: true },
      { onConflict: 'user_id,log_date,plan_day_id' }
    )
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function markDayUndone(planDayId: string, logDate: string): Promise<void> {
  const { error } = await supabase
    .from('workout_logs')
    .delete()
    .eq('plan_day_id', planDayId)
    .eq('log_date', logDate);
  if (error) throw error;
}

export async function listLogSets(logId: string, exerciseId: string): Promise<SetEntry[]> {
  const { data, error } = await supabase
    .from('workout_log_sets')
    .select('set_number, reps_done, weight_kg, rpe')
    .eq('log_id', logId)
    .eq('exercise_id', exerciseId)
    .order('set_number', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    setNumber: row.set_number,
    repsDone: row.reps_done,
    weightKg: row.weight_kg,
    rpe: row.rpe,
  }));
}

// Séries da ÚLTIMA vez (antes de `beforeDate`) que o atleta fez esse
// exercício, em QUALQUER dia do plano — é a base de comparação certa pra
// sugestão de progressão (não importa se foi num dia de treino diferente,
// o que importa é a carga da sessão anterior desse mesmo exercício).
//
// Em duas consultas simples (só .eq/.lt/.in, sem filtro por coluna de
// tabela aninhada) de propósito: a RLS de workout_log_sets já garante que
// só vêm séries de logs do próprio usuário (ou do atleta, se for o
// treinador chamando) — não precisa reforçar isso aqui, e evita depender
// da sintaxe mais frágil de filtro/order em tabela embutida do PostgREST.
export async function getLastCompletedSets(userId: string, exerciseId: string, beforeDate: string): Promise<SetEntry[]> {
  const { data: recentLogs, error: logsError } = await supabase
    .from('workout_logs')
    .select('id, log_date')
    .eq('user_id', userId)
    .lt('log_date', beforeDate)
    .order('log_date', { ascending: false })
    .limit(30);
  if (logsError) throw logsError;
  if (!recentLogs || recentLogs.length === 0) return [];

  const logIds = recentLogs.map((l) => l.id);
  const { data: sets, error: setsError } = await supabase
    .from('workout_log_sets')
    .select('log_id, set_number, reps_done, weight_kg, rpe')
    .eq('exercise_id', exerciseId)
    .in('log_id', logIds);
  if (setsError) throw setsError;
  if (!sets || sets.length === 0) return [];

  // Entre os logs (candidatos) que de fato têm esse exercício, fica com o
  // de data mais recente.
  const logDateById = new Map(recentLogs.map((l) => [l.id, l.log_date]));
  const mostRecentLogId = sets.reduce((best, s) => {
    const bestDate = logDateById.get(best) ?? '';
    const thisDate = logDateById.get(s.log_id) ?? '';
    return thisDate > bestDate ? s.log_id : best;
  }, sets[0].log_id);

  return sets
    .filter((s) => s.log_id === mostRecentLogId)
    .sort((a, b) => a.set_number - b.set_number)
    .map((s) => ({ setNumber: s.set_number, repsDone: s.reps_done, weightKg: s.weight_kg, rpe: s.rpe }));
}

// Todas as séries registradas nos últimos `days` dias, marcadas com o
// grupo muscular do exercício — matéria-prima de
// weeklyVolumeByMuscleGroup (src/lib/muscleVolume.ts). Uma consulta só,
// com os exercícios e o grupo muscular embutidos via join do PostgREST.
export async function listRecentLoggedSets(userId: string, days = 35): Promise<LoggedSetEntry[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('workout_logs')
    .select('log_date, workout_log_sets (exercise_id, exercises (muscle_group))')
    .eq('user_id', userId)
    .gte('log_date', sinceIso);
  if (error) throw error;

  const entries: LoggedSetEntry[] = [];
  for (const log of (data ?? []) as any[]) {
    for (const set of log.workout_log_sets ?? []) {
      entries.push({ muscleGroup: set.exercises?.muscle_group ?? null, logDate: log.log_date });
    }
  }
  return entries;
}

// Média de RPE das sessões de musculação dos últimos `days` dias —
// alimenta o Score de Prontidão (src/lib/readiness.ts) como o sinal de
// "quão pesado a musculação recente pesou". null quando não há nenhuma
// série com RPE registrado ainda no período (não confundir com "RPE
// zero" — a ausência de dado precisa continuar sendo neutra, nunca virar
// um 0 artificial).
export async function getRecentAverageRpe(userId: string, days = 14): Promise<number | null> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('workout_logs')
    .select('workout_log_sets (rpe)')
    .eq('user_id', userId)
    .gte('log_date', sinceIso);
  if (error) throw error;

  const values: number[] = [];
  for (const log of (data ?? []) as any[]) {
    for (const set of log.workout_log_sets ?? []) {
      if (set.rpe != null) values.push(set.rpe);
    }
  }
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Maverick Coach IA — chama a Edge Function que monta o plano com a Claude
// API e grava o resultado no plano do atleta, usando o client normal (as
// mesmas policies de RLS de sempre: o próprio atleta ou um treinador
// vinculado-aceito podem chamar isso). SUBSTITUI os exercícios de cada dia
// que a IA preencheu — é uma geração nova, não um merge.
type AIPlanDay = {
  dayOfWeek: number;
  label: string;
  isRestDay: boolean;
  exercises: { name: string; muscleGroup?: string; sets: number; reps: string; notes?: string }[];
};

export async function generateAIPlan(
  athleteUserId: string,
  createdBy: string,
  fields: { level: AthleteLevel; goal?: string; daysPerWeek: number; equipmentNotes?: string }
): Promise<void> {
  const plan = await getOrCreatePlan(athleteUserId, createdBy);
  const [days, catalog] = await Promise.all([listPlanDays(plan.id), listExercises()]);

  const { data, error } = await supabase.functions.invoke('generate-workout-plan', {
    body: {
      level: fields.level,
      goal: fields.goal,
      daysPerWeek: fields.daysPerWeek,
      equipmentNotes: fields.equipmentNotes,
      catalog: catalog.map((e) => ({ name: e.name, muscleGroup: e.muscleGroup })),
    },
  });
  if (error) throw error;
  if (!data?.plan?.days) throw new Error(data?.error ?? 'A IA não devolveu um plano válido.');

  const aiDays: AIPlanDay[] = data.plan.days;
  const catalogByName = new Map(catalog.map((e) => [e.name.trim().toLowerCase(), e]));

  for (const aiDay of aiDays) {
    const day = days.find((d) => d.dayOfWeek === aiDay.dayOfWeek);
    if (!day) continue;

    await updateDay(day.id, { label: aiDay.label, isRestDay: aiDay.isRestDay });
    await clearDayExercises(day.id);

    for (let i = 0; i < aiDay.exercises.length; i++) {
      const ex = aiDay.exercises[i];
      const key = ex.name.trim().toLowerCase();
      let matched = catalogByName.get(key);
      if (!matched) {
        matched = await addExercise(createdBy, { name: ex.name, muscleGroup: ex.muscleGroup });
        catalogByName.set(key, matched);
      }
      await addExerciseToDay(day.id, matched.id, { sets: ex.sets, reps: ex.reps, notes: ex.notes }, i);
    }
  }

  const { error: planError } = await supabase
    .from('workout_plans')
    .update({ level: fields.level, goal: fields.goal ?? null })
    .eq('id', plan.id);
  if (planError) throw planError;
}

// Substitui todas as séries daquele exercício naquele log — mais simples e
// robusto do que tentar reconciliar linha a linha (não sobra série órfã se
// o atleta reduzir a quantidade).
export async function saveLogSets(logId: string, exerciseId: string, sets: SetEntry[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from('workout_log_sets')
    .delete()
    .eq('log_id', logId)
    .eq('exercise_id', exerciseId);
  if (deleteError) throw deleteError;

  if (sets.length === 0) return;

  const rows = sets.map((s) => ({
    log_id: logId,
    exercise_id: exerciseId,
    set_number: s.setNumber,
    reps_done: s.repsDone,
    weight_kg: s.weightKg,
    rpe: s.rpe,
  }));
  const { error: insertError } = await supabase.from('workout_log_sets').insert(rows);
  if (insertError) throw insertError;
}
