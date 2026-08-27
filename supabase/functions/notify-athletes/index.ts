// Maverick Coach — notificações push proativas (prontidão baixa, deload
// atrasado, prova chegando). Chamado por um workflow agendado do GitHub
// Actions (ver .github/workflows/notify-athletes.yml), não pelo app —
// mesmo esquema de segredo compartilhado (CRON_SECRET) que
// strava-sync-all já usa.
//
// A decisão de QUANDO avisar e o texto do aviso moram em
// ../_shared/notifyLogic.ts (testável sem Supabase de verdade). Este
// arquivo só junta os dados de cada usuário, chama a decisão, e dispara
// o push via Expo.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildCandidates, shouldNotify, type MinimalActivity } from '../_shared/notifyLogic.ts';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Só olha atividades/treinos dos últimos 35 dias — suficiente pra ACWR
// (janela de 28 dias) e deload (histórico de algumas semanas) sem puxar
// o histórico inteiro de cada usuário a cada execução do cron.
const LOOKBACK_DAYS = 35;

// deno-lint-ignore no-explicit-any
type AdminClient = any;

async function gatherUserSignals(admin: AdminClient, userId: string) {
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
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
    .select('sleep_hours')
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

  return { activities, recentAvgRpe, latestSleepHours, nextRaceDate };
}

export async function handler(req: Request): Promise<Response> {
  const expected = Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('x-cron-secret');
  if (!expected || provided !== expected) {
    return json({ error: 'Não autorizado.' }, 401);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: tokenRows, error: tokenError } = await admin.from('push_tokens').select('user_id, token');
  if (tokenError) {
    console.error('Erro ao listar push_tokens:', tokenError);
    return json({ error: 'Não foi possível listar os tokens.' }, 500);
  }

  const tokensByUser = new Map<string, string[]>();
  for (const row of tokenRows ?? []) {
    const list = tokensByUser.get(row.user_id as string) ?? [];
    list.push(row.token as string);
    tokensByUser.set(row.user_id as string, list);
  }

  let usersWithCandidates = 0;
  let messagesSent = 0;
  let failed = 0;

  for (const [userId, tokens] of tokensByUser) {
    try {
      const signals = await gatherUserSignals(admin, userId);
      const candidates = buildCandidates(signals);
      if (candidates.length === 0) continue;
      usersWithCandidates++;

      for (const candidate of candidates) {
        const { data: lastLog } = await admin
          .from('notification_log')
          .select('sent_at')
          .eq('user_id', userId)
          .eq('notification_type', candidate.type)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!shouldNotify(candidate.type, lastLog?.sent_at ?? null)) continue;

        const messages = tokens.map((to) => ({ to, title: candidate.title, body: candidate.body, sound: 'default' }));
        const pushResp = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(messages),
        });
        if (!pushResp.ok) {
          console.error(`Falha ao enviar push (${candidate.type}) pro usuário ${userId}:`, await pushResp.text());
          continue;
        }
        messagesSent += messages.length;

        await admin.from('notification_log').insert({ user_id: userId, notification_type: candidate.type });
      }
    } catch (err) {
      failed++;
      console.error(`Falha ao processar notificações do usuário ${userId}:`, err);
    }
  }

  return json({ usersChecked: tokensByUser.size, usersWithCandidates, messagesSent, failed });
}

if (import.meta.main) {
  Deno.serve(handler);
}
