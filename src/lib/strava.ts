import * as Linking from 'expo-linking';
import { supabase } from './supabase';

/**
 * Maverick Health — integração real com o Strava (atividades: corrida,
 * pedal, caminhada etc.). Fica separado do cálculo do Maverick Score de
 * propósito — o Strava não tem sono/HRV, então misturar geraria uma
 * estimativa fraca. É um registro de atividades à parte.
 *
 * O fluxo de conexão (OAuth) e a sincronização rodam em Edge Functions
 * (supabase/functions/strava-oauth-callback e strava-sync) — os tokens do
 * Strava nunca passam pelo app nem ficam legíveis por ele.
 */

export type StravaActivity = {
  id: string;
  stravaActivityId: number;
  type: string;
  name: string;
  distanceMeters: number | null;
  movingTimeSeconds: number | null;
  calories: number | null;
  averageHeartrate: number | null;
  startedAt: string;
};

export type StravaStatus = {
  connected: boolean;
  athleteId?: number;
  connectedAt?: string;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;

export function isStravaConfigured(): boolean {
  return !!STRAVA_CLIENT_ID;
}

// O "state" carrega o access_token da sessão atual — é assim que a Edge
// Function do callback sabe de quem é essa conexão (ver o arquivo da
// função pra mais detalhes de por que essa abordagem é segura o bastante
// pra essa fase do produto).
export async function getStravaAuthorizeUrl(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sessão não encontrada.');

  const redirectUri = `${SUPABASE_URL}/functions/v1/strava-oauth-callback`;
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state: accessToken,
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export async function connectStrava(): Promise<void> {
  const url = await getStravaAuthorizeUrl();
  await Linking.openURL(url);
}

export async function getStravaStatus(): Promise<StravaStatus> {
  const { data, error } = await supabase.rpc('get_my_strava_status');
  if (error) throw error;
  const row = data?.[0];
  if (!row) return { connected: false };
  return { connected: true, athleteId: row.strava_athlete_id, connectedAt: row.connected_at };
}

export async function disconnectStrava(userId: string): Promise<void> {
  const { error } = await supabase.from('strava_connections').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function syncStravaActivities(): Promise<{ synced: number }> {
  const { data, error } = await supabase.functions.invoke('strava-sync', { body: {} });
  if (error) throw error;
  return data;
}

export async function listStravaActivities(userId: string, limit = 20): Promise<StravaActivity[]> {
  const { data, error } = await supabase
    .from('strava_activities')
    .select('id, strava_activity_id, activity_type, name, distance_m, moving_time_s, calories, average_heartrate, started_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    stravaActivityId: row.strava_activity_id,
    type: row.activity_type,
    name: row.name,
    distanceMeters: row.distance_m,
    movingTimeSeconds: row.moving_time_s,
    calories: row.calories,
    averageHeartrate: row.average_heartrate,
    startedAt: row.started_at,
  }));
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  Run: 'Corrida',
  Ride: 'Pedal',
  Walk: 'Caminhada',
  Hike: 'Trilha',
  Swim: 'Natação',
  WeightTraining: 'Musculação',
  Workout: 'Treino',
};

export function activityTypeLabel(type: string): string {
  return ACTIVITY_TYPE_LABELS[type] ?? type;
}

export function formatDistance(meters: number | null): string {
  if (meters == null) return '—';
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m} min`;
}
