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
  /** Campo mais granular do Strava (ex.: TrailRun, VirtualRide) — usado
   * pra decidir quais métricas mostrar (pace vs. potência vs. genérico).
   * Cai pra `type` em atividades sincronizadas antes dessa coluna existir. */
  sportType: string;
  name: string;
  distanceMeters: number | null;
  movingTimeSeconds: number | null;
  calories: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageSpeedMs: number | null;
  maxSpeedMs: number | null;
  averageWatts: number | null;
  weightedAverageWatts: number | null;
  averageCadence: number | null;
  totalElevationGainM: number | null;
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
    .select(
      'id, strava_activity_id, activity_type, sport_type, name, distance_m, moving_time_s, calories, average_heartrate, max_heartrate, average_speed_ms, max_speed_ms, average_watts, weighted_average_watts, average_cadence, total_elevation_gain_m, started_at'
    )
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    stravaActivityId: row.strava_activity_id,
    type: row.activity_type,
    sportType: row.sport_type ?? row.activity_type,
    name: row.name,
    distanceMeters: row.distance_m,
    movingTimeSeconds: row.moving_time_s,
    calories: row.calories,
    averageHeartrate: row.average_heartrate,
    maxHeartrate: row.max_heartrate,
    averageSpeedMs: row.average_speed_ms,
    maxSpeedMs: row.max_speed_ms,
    averageWatts: row.average_watts,
    weightedAverageWatts: row.weighted_average_watts,
    averageCadence: row.average_cadence,
    totalElevationGainM: row.total_elevation_gain_m,
    startedAt: row.started_at,
  }));
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  Run: 'Corrida',
  TrailRun: 'Trilha (corrida)',
  Ride: 'Pedal',
  VirtualRide: 'Pedal (indoor)',
  MountainBikeRide: 'Mountain bike',
  GravelRide: 'Pedal (gravel)',
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

/**
 * Separação por esporte pra decidir qual métrica de endurance faz sentido
 * mostrar — pace não diz nada pra quem pedala (queremos km/h e potência),
 * e potência quase nunca existe fora do pedal. Baseado no sport_type
 * (mais granular) do Strava, com fallback pro type genérico.
 */
export type EnduranceSportCategory = 'run' | 'ride' | 'swim' | 'other';

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
const RIDE_TYPES = new Set(['Ride', 'VirtualRide', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'Handcycle']);
const SWIM_TYPES = new Set(['Swim']);

export function enduranceSportCategory(sportType: string): EnduranceSportCategory {
  if (RUN_TYPES.has(sportType)) return 'run';
  if (RIDE_TYPES.has(sportType)) return 'ride';
  if (SWIM_TYPES.has(sportType)) return 'swim';
  return 'other';
}

/** Pace de corrida em min/km, a partir da velocidade média (m/s) que o Strava manda. */
export function formatPaceMinKm(averageSpeedMs: number | null): string {
  if (averageSpeedMs == null || averageSpeedMs <= 0) return '—';
  const secPerKm = 1000 / averageSpeedMs;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  const ss = s === 60 ? 0 : s;
  const mm = s === 60 ? m + 1 : m;
  return `${mm}:${ss.toString().padStart(2, '0')} /km`;
}

/** Pace de natação em min/100m — mesma ideia do pace de corrida, escala diferente. */
export function formatPaceMin100m(averageSpeedMs: number | null): string {
  if (averageSpeedMs == null || averageSpeedMs <= 0) return '—';
  const secPer100m = 100 / averageSpeedMs;
  const m = Math.floor(secPer100m / 60);
  const s = Math.round(secPer100m % 60);
  const ss = s === 60 ? 0 : s;
  const mm = s === 60 ? m + 1 : m;
  return `${mm}:${ss.toString().padStart(2, '0')} /100m`;
}

/** Velocidade em km/h — o que faz sentido pra pedal, ao contrário de pace. */
export function formatSpeedKmh(averageSpeedMs: number | null): string {
  if (averageSpeedMs == null) return '—';
  return `${(averageSpeedMs * 3.6).toFixed(1)} km/h`;
}

/**
 * Potência formatada, priorizando a normalizada (weighted_average_watts —
 * pesa picos de esforço, métrica padrão de treino com potência) sobre a
 * média simples quando o Strava manda as duas.
 */
export function formatPower(averageWatts: number | null, weightedAverageWatts: number | null): string {
  const w = weightedAverageWatts ?? averageWatts;
  if (w == null) return '—';
  return `${Math.round(w)} W${weightedAverageWatts != null ? ' (NP)' : ''}`;
}

export function formatCadence(cadence: number | null, sport: EnduranceSportCategory): string {
  if (cadence == null) return '—';
  // Corrida: o Strava manda cadência de UMA perna (rpm) — dobra pra virar
  // passadas/min, o número que todo corredor reconhece.
  const value = sport === 'run' ? Math.round(cadence * 2) : Math.round(cadence);
  const unit = sport === 'run' ? 'spm' : 'rpm';
  return `${value} ${unit}`;
}

export function formatElevationGain(meters: number | null): string {
  if (meters == null || meters <= 0) return '—';
  return `+${Math.round(meters)} m`;
}
