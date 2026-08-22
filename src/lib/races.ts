import { supabase } from './supabase';

/**
 * Maverick Coach — próxima prova (alimenta o taper, src/lib/taper.ts).
 * Guarda quantas provas o atleta quiser no histórico, mas a UI só mostra
 * a mais próxima ainda não realizada — é o que importa pro taper de agora.
 */

export type RaceSport = 'triatlo' | 'corrida' | 'pedal' | 'natacao';

export const RACE_SPORTS: { value: RaceSport; label: string }[] = [
  { value: 'triatlo', label: 'Triatlo' },
  { value: 'corrida', label: 'Corrida' },
  { value: 'pedal', label: 'Pedal' },
  { value: 'natacao', label: 'Natação' },
];

export function raceSportLabel(sport: string): string {
  return RACE_SPORTS.find((s) => s.value === sport)?.label ?? sport;
}

export type UpcomingRace = {
  id: string;
  name: string;
  sport: RaceSport;
  raceDate: string; // yyyy-mm-dd
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getNextRace(userId: string): Promise<UpcomingRace | null> {
  const { data, error } = await supabase
    .from('upcoming_races')
    .select('id, name, sport, race_date')
    .eq('user_id', userId)
    .gte('race_date', todayIsoDate())
    .order('race_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.name, sport: data.sport, raceDate: data.race_date };
}

export async function upsertRace(
  userId: string,
  raceId: string | null,
  fields: { name: string; sport: RaceSport; raceDate: string }
): Promise<void> {
  if (raceId) {
    const { error } = await supabase
      .from('upcoming_races')
      .update({ name: fields.name.trim(), sport: fields.sport, race_date: fields.raceDate })
      .eq('id', raceId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('upcoming_races').insert({
    user_id: userId,
    name: fields.name.trim(),
    sport: fields.sport,
    race_date: fields.raceDate,
  });
  if (error) throw error;
}

export async function deleteRace(raceId: string): Promise<void> {
  const { error } = await supabase.from('upcoming_races').delete().eq('id', raceId);
  if (error) throw error;
}
