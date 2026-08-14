// Lógica de sincronização com o Strava compartilhada entre duas Edge
// Functions: strava-sync (sob demanda, autenticado com o JWT do próprio
// usuário) e strava-sync-all (automático, chamado por um cron do GitHub
// Actions com um segredo compartilhado, percorre todo mundo que já
// conectou). Extraído aqui pra não duplicar a parte que importa de
// verdade — renovar token, montar a linha da atividade — entre as duas.

// Tipado como `any` de propósito: `ReturnType<typeof createClient>` (o
// tipo "oficial") resolve pra uma das sobrecargas genéricas da lib e
// discorda do tipo inferido no ponto de chamada real (`createClient(url,
// key)`, sem generics) — mesmo raciocínio já usado em analyze-vision pra
// evitar brigar com a tipagem oficial do client em vez do que a função
// realmente usa (`.from(tabela).select/update/upsert`).
// deno-lint-ignore no-explicit-any
type AdminClient = any;

// Margem de 5 min antes de expirar — extraído pra dar pra testar a
// matemática do "precisa renovar?" sem precisar de um token do Strava de
// verdade nem mockar o relógio do sistema (aceita `now` como parâmetro).
export function needsTokenRefresh(expiresAtIso: string, now: number = Date.now()): boolean {
  const expiresAt = new Date(expiresAtIso).getTime();
  return expiresAt - now < 5 * 60 * 1000;
}

// Mapeamento de uma atividade do Strava pra uma linha de strava_activities —
// extraído do .map() inline pra dar pra testar os fallbacks (tipo ausente,
// campos numéricos ausentes) sem precisar chamar a API do Strava.
export function toActivityRow(userId: string, a: Record<string, unknown>) {
  return {
    user_id: userId,
    strava_activity_id: a.id,
    activity_type: a.type ?? a.sport_type ?? 'Activity',
    name: a.name ?? '',
    distance_m: a.distance ?? null,
    moving_time_s: a.moving_time ?? null,
    calories: a.calories ?? null,
    average_heartrate: a.average_heartrate ?? null,
    started_at: a.start_date ?? new Date().toISOString(),
  };
}

export class StravaNotConnectedError extends Error {}
export class StravaApiError extends Error {}

async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: number;
}> {
  const resp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('STRAVA_CLIENT_ID'),
      client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!resp.ok) throw new Error(`Falha ao renovar token do Strava: ${await resp.text()}`);
  return resp.json();
}

// Sincroniza as atividades recentes (30 dias) de UM usuário. `admin` já
// precisa ser um client de service_role — é o único jeito de ler
// strava_connections, que não tem policy nenhuma pro papel authenticated.
export async function syncStravaForUser(admin: AdminClient, userId: string): Promise<{ synced: number }> {
  const { data: connection, error: connError } = await admin
    .from('strava_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single();
  if (connError || !connection) {
    throw new StravaNotConnectedError('Strava não está conectado.');
  }

  let accessToken = connection.access_token as string;

  // Token do Strava expira em poucas horas — renova se estiver vencido
  // ou perto disso (margem de 5 min).
  if (needsTokenRefresh(connection.expires_at as string)) {
    const refreshed = await refreshAccessToken(connection.refresh_token as string);
    accessToken = refreshed.access_token;
    await admin
      .from('strava_connections')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
      })
      .eq('user_id', userId);
  }

  // Últimas atividades (30 dias) — suficiente pra manter a lista
  // atualizada sem puxar o histórico inteiro a cada sincronização.
  const after = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const activitiesResp = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!activitiesResp.ok) {
    const detail = await activitiesResp.text();
    console.error(`Erro ao buscar atividades do Strava (user ${userId}):`, detail);
    throw new StravaApiError('Não foi possível buscar as atividades agora.');
  }

  const activities = await activitiesResp.json();
  const rows = (activities as Array<Record<string, unknown>>).map((a) => toActivityRow(userId, a));

  if (rows.length > 0) {
    const { error: upsertError } = await admin.from('strava_activities').upsert(rows, { onConflict: 'strava_activity_id' });
    if (upsertError) throw upsertError;
  }

  return { synced: rows.length };
}
