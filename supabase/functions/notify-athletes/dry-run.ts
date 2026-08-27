// Script de verificação manual (não é rodado pelo CI) — simula
// exatamente o que a Edge Function faria pra um user_id real, usando o
// mesmo service_role, SEM precisar do CRON_SECRET nem passar pelo HTTP.
// Uso: deno run --allow-net --allow-env dry-run.ts <user_id>
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildCandidates, type MinimalActivity } from '../_shared/notifyLogic.ts';

const userId = Deno.args[0];
if (!userId) {
  console.error('Uso: deno run --allow-net --allow-env dry-run.ts <user_id>');
  Deno.exit(1);
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const since = new Date();
since.setDate(since.getDate() - 35);
const sinceDateIso = since.toISOString().slice(0, 10);
const sinceInstantIso = since.toISOString();

const { data: activityRows } = await admin
  .from('strava_activities')
  .select('sport_type, activity_type, started_at, moving_time_s, average_heartrate, max_heartrate')
  .eq('user_id', userId)
  .gte('started_at', sinceInstantIso);

const activities: MinimalActivity[] = (activityRows ?? []).map((a: Record<string, unknown>) => ({
  sportType: (a.sport_type as string) ?? (a.activity_type as string) ?? 'Activity',
  startedAt: a.started_at as string,
  movingTimeSeconds: a.moving_time_s as number | null,
  averageHeartrate: a.average_heartrate as number | null,
  maxHeartrate: a.max_heartrate as number | null,
}));

const { data: logRows } = await admin.from('workout_logs').select('id').eq('user_id', userId).gte('log_date', sinceDateIso);
const logIds = (logRows ?? []).map((l: { id: string }) => l.id);

let recentAvgRpe: number | null = null;
if (logIds.length > 0) {
  const { data: setRows } = await admin.from('workout_log_sets').select('rpe').in('log_id', logIds);
  const rpeValues = (setRows ?? []).map((s: { rpe: number | null }) => s.rpe).filter((v: number | null): v is number => v != null);
  if (rpeValues.length > 0) recentAvgRpe = rpeValues.reduce((a: number, b: number) => a + b, 0) / rpeValues.length;
}

const { data: healthRows } = await admin
  .from('health_entries')
  .select('sleep_hours, entry_date')
  .eq('user_id', userId)
  .order('entry_date', { ascending: false })
  .limit(1);
const latestSleepHours = healthRows?.[0]?.sleep_hours ?? null;

const { data: raceRows } = await admin
  .from('upcoming_races')
  .select('race_date')
  .eq('user_id', userId)
  .gte('race_date', new Date().toISOString().slice(0, 10))
  .order('race_date', { ascending: true })
  .limit(1);
const nextRaceDate = raceRows?.[0]?.race_date ?? null;

console.log('Sinais coletados:', {
  activityCount: activities.length,
  recentAvgRpe,
  latestSleepHours,
  latestSleepDate: healthRows?.[0]?.entry_date ?? null,
  nextRaceDate,
});

const candidates = buildCandidates({ activities, recentAvgRpe, latestSleepHours, nextRaceDate });
console.log('Candidatos de notificação:', JSON.stringify(candidates, null, 2));
