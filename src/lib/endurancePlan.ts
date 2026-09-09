import { supabase } from './supabase';
import { enduranceSportCategory, type EnduranceSportCategory } from './strava';

/**
 * Maverick Endurance — plano semanal de corrida/bike/natação, prescrito
 * pelo treinador (ou pelo próprio atleta, se autotreinado). Antes disso,
 * tudo que existia pro lado de endurance era retrospectivo (sync do
 * Strava + análise de carga/ACWR/zonas — ver trainingLoad.ts) — o
 * atleta nunca sabia ANTES o que treinar, só via depois o que já tinha
 * feito. Mesmo espírito de workouts.ts (musculação), mas mais simples:
 * uma tabela só, plana, por dia da semana — não existe "catálogo de
 * exercício de corrida" compartilhado pra reaproveitar entre atletas
 * como existe em public.exercises.
 */

export type EnduranceSport = 'corrida' | 'bike' | 'natacao' | 'outro';

export const ENDURANCE_SPORT_LABELS: Record<EnduranceSport, string> = {
  corrida: 'Corrida',
  bike: 'Bike',
  natacao: 'Natação',
  outro: 'Outro',
};

export type EnduranceWorkoutType =
  | 'rodagem'
  | 'longao'
  | 'intervalado'
  | 'tempo_run'
  | 'fartlek'
  | 'regenerativo'
  | 'prova'
  | 'folga';

export const ENDURANCE_WORKOUT_TYPE_LABELS: Record<EnduranceWorkoutType, string> = {
  rodagem: 'Rodagem leve',
  longao: 'Longão',
  intervalado: 'Intervalado',
  tempo_run: 'Tempo run',
  fartlek: 'Fartlek',
  regenerativo: 'Regenerativo',
  prova: 'Prova',
  folga: 'Folga',
};

export type EnduranceSession = {
  id: string;
  userId: string;
  dayOfWeek: number; // 0 = domingo … 6 = sábado
  sport: EnduranceSport | null;
  workoutType: EnduranceWorkoutType;
  targetZone: number | null; // 1-5
  targetPace: string | null; // texto livre, ex: "5:30/km"
  plannedDistanceKm: number | null;
  plannedDurationMin: number | null;
  structureNotes: string | null;
  sortOrder: number;
};

export type NewEnduranceSession = {
  dayOfWeek: number;
  sport: EnduranceSport | null;
  workoutType: EnduranceWorkoutType;
  targetZone?: number | null;
  targetPace?: string | null;
  plannedDistanceKm?: number | null;
  plannedDurationMin?: number | null;
  structureNotes?: string | null;
};

function toSession(row: any): EnduranceSession {
  return {
    id: row.id,
    userId: row.user_id,
    dayOfWeek: row.day_of_week,
    sport: row.sport,
    workoutType: row.workout_type,
    targetZone: row.target_zone,
    targetPace: row.target_pace,
    plannedDistanceKm: row.planned_distance_km,
    plannedDurationMin: row.planned_duration_min,
    structureNotes: row.structure_notes,
    sortOrder: row.sort_order,
  };
}

export async function listEnduranceSessions(userId: string): Promise<EnduranceSession[]> {
  const { data, error } = await supabase
    .from('endurance_plan_sessions')
    .select(
      'id, user_id, day_of_week, sport, workout_type, target_zone, target_pace, planned_distance_km, planned_duration_min, structure_notes, sort_order'
    )
    .eq('user_id', userId)
    .order('day_of_week', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toSession);
}

export async function addEnduranceSession(userId: string, session: NewEnduranceSession): Promise<EnduranceSession> {
  const { data, error } = await supabase
    .from('endurance_plan_sessions')
    .insert({
      user_id: userId,
      day_of_week: session.dayOfWeek,
      sport: session.sport,
      workout_type: session.workoutType,
      target_zone: session.targetZone ?? null,
      target_pace: session.targetPace?.trim() || null,
      planned_distance_km: session.plannedDistanceKm ?? null,
      planned_duration_min: session.plannedDurationMin ?? null,
      structure_notes: session.structureNotes?.trim() || null,
    })
    .select(
      'id, user_id, day_of_week, sport, workout_type, target_zone, target_pace, planned_distance_km, planned_duration_min, structure_notes, sort_order'
    )
    .single();
  if (error) throw error;
  return toSession(data);
}

export async function updateEnduranceSession(id: string, patch: Partial<NewEnduranceSession>): Promise<void> {
  const update: Record<string, unknown> = {};
  if ('dayOfWeek' in patch) update.day_of_week = patch.dayOfWeek;
  if ('sport' in patch) update.sport = patch.sport;
  if ('workoutType' in patch) update.workout_type = patch.workoutType;
  if ('targetZone' in patch) update.target_zone = patch.targetZone ?? null;
  if ('targetPace' in patch) update.target_pace = patch.targetPace?.trim() || null;
  if ('plannedDistanceKm' in patch) update.planned_distance_km = patch.plannedDistanceKm ?? null;
  if ('plannedDurationMin' in patch) update.planned_duration_min = patch.plannedDurationMin ?? null;
  if ('structureNotes' in patch) update.structure_notes = patch.structureNotes?.trim() || null;
  update.updated_at = new Date().toISOString();

  const { error } = await supabase.from('endurance_plan_sessions').update(update).eq('id', id);
  if (error) throw error;
}

export async function removeEnduranceSession(id: string): Promise<void> {
  const { error } = await supabase.from('endurance_plan_sessions').delete().eq('id', id);
  if (error) throw error;
}

// --- Lógica pura -----------------------------------------------------------

/** Agrupa as sessões por dia da semana (0-6), sempre com as 7 chaves presentes mesmo sem nenhuma sessão naquele dia. */
export function groupSessionsByDay(sessions: EnduranceSession[]): Record<number, EnduranceSession[]> {
  const byDay: Record<number, EnduranceSession[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const s of sessions) {
    byDay[s.dayOfWeek].push(s);
  }
  return byDay;
}

/** Resumo curto pra exibir num card/linha: "8km · Z2 · 5:30/km" — só as partes que têm dado. */
export function summarizeSession(session: EnduranceSession): string {
  const parts: string[] = [];
  if (session.plannedDistanceKm != null) parts.push(`${session.plannedDistanceKm}km`);
  if (session.plannedDurationMin != null) parts.push(`${session.plannedDurationMin}min`);
  if (session.targetZone != null) parts.push(`Z${session.targetZone}`);
  if (session.targetPace) parts.push(session.targetPace);
  return parts.join(' · ');
}

// --- Planejado × realizado --------------------------------------------------
//
// Fecha o ciclo do plano: uma sessão prescrita ("terça: 8km Z2") só vira
// treino de verdade se comparada com o que o Strava sincronizou depois.
// Reaproveita enduranceSportCategory (strava.ts) pra não duplicar a
// classificação de tipo de atividade — só traduz o vocabulário PT-BR do
// plano (corrida/bike/natação) pro vocabulário em inglês do Strava.

function sportToCategory(sport: EnduranceSport | null): EnduranceSportCategory {
  if (sport === 'corrida') return 'run';
  if (sport === 'bike') return 'ride';
  if (sport === 'natacao') return 'swim';
  return 'other';
}

export type ActivityForMatch = {
  sportType: string;
  distanceMeters: number | null;
  movingTimeSeconds: number | null;
  startedAt: string; // ISO datetime
};

export type SessionMatchStatus = 'folga' | 'pendente' | 'cumprido' | 'nao_registrado';

export type SessionMatch = {
  status: SessionMatchStatus;
  actualDistanceKm: number | null;
  actualDurationMin: number | null;
};

/**
 * Cruza uma sessão planejada (já resolvida pra uma data específica dessa
 * semana) com as atividades reais sincronizadas do Strava. "Folga" nunca
 * precisa de correspondência. Hoje e dias futuros ficam "pendente" (o
 * dia ainda não terminou, não é justo cobrar já) — só datas ESTRITAMENTE
 * passadas sem atividade correspondente viram "não registrado".
 */
export function matchSessionToActivity(
  session: EnduranceSession,
  dateIso: string,
  activities: ActivityForMatch[],
  todayIso: string
): SessionMatch {
  if (session.workoutType === 'folga') return { status: 'folga', actualDistanceKm: null, actualDurationMin: null };

  const category = sportToCategory(session.sport);
  const match = activities.find((a) => a.startedAt.slice(0, 10) === dateIso && enduranceSportCategory(a.sportType) === category);

  if (match) {
    return {
      status: 'cumprido',
      actualDistanceKm: match.distanceMeters != null ? Math.round((match.distanceMeters / 1000) * 10) / 10 : null,
      actualDurationMin: match.movingTimeSeconds != null ? Math.round(match.movingTimeSeconds / 60) : null,
    };
  }

  if (dateIso >= todayIso) return { status: 'pendente', actualDistanceKm: null, actualDurationMin: null };
  return { status: 'nao_registrado', actualDistanceKm: null, actualDurationMin: null };
}
