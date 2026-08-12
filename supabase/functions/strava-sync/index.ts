// Maverick Health — sincroniza as atividades recentes do Strava.
//
// Rota autenticada normal (verifica o JWT do usuário no header
// Authorization, como a analyze-vision). Usa a service_role key só pra
// mexer em strava_connections (que não tem policy nenhuma pro cliente,
// de propósito — ver supabase/schema.sql). As atividades em si são
// gravadas com o mesmo client de service role, mas sempre escopadas ao
// user_id de quem chamou.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    // Client "como o usuário" só pra confirmar quem está chamando.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401);
    const userId = userData.user.id;

    // Service role daqui pra baixo — é o único jeito de ler/escrever em
    // strava_connections, que não tem policy nenhuma pro papel authenticated.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: connection, error: connError } = await admin
      .from('strava_connections')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .single();
    if (connError || !connection) {
      return json({ error: 'Strava não está conectado.' }, 400);
    }

    let accessToken = connection.access_token;

    // Token do Strava expira em poucas horas — renova se estiver
    // vencido ou perto disso (margem de 5 min).
    const expiresAt = new Date(connection.expires_at).getTime();
    if (expiresAt - Date.now() < 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(connection.refresh_token);
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

    // Últimas atividades (30 dias) — suficiente pra manter a lista atualizada
    // sem puxar o histórico inteiro a cada sincronização.
    const after = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const activitiesResp = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!activitiesResp.ok) {
      const detail = await activitiesResp.text();
      console.error('Erro ao buscar atividades do Strava:', detail);
      return json({ error: 'Não foi possível buscar as atividades agora.' }, 502);
    }

    const activities = await activitiesResp.json();

    const rows = (activities as Array<Record<string, unknown>>).map((a) => ({
      user_id: userId,
      strava_activity_id: a.id,
      activity_type: a.type ?? a.sport_type ?? 'Activity',
      name: a.name ?? '',
      distance_m: a.distance ?? null,
      moving_time_s: a.moving_time ?? null,
      calories: a.calories ?? null,
      average_heartrate: a.average_heartrate ?? null,
      started_at: a.start_date ?? new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error: upsertError } = await admin
        .from('strava_activities')
        .upsert(rows, { onConflict: 'strava_activity_id' });
      if (upsertError) throw upsertError;
    }

    return json({ synced: rows.length });
  } catch (err) {
    console.error(err);
    return json({ error: 'Erro inesperado ao sincronizar com o Strava.' }, 500);
  }
});
