// Maverick Health — sincroniza as atividades recentes do Strava.
//
// Rota autenticada normal (verifica o JWT do usuário no header
// Authorization, como a analyze-vision). A lógica de sincronização em si
// (renovar token, buscar atividades, gravar) mora em ../_shared/stravaSync.ts,
// compartilhada com strava-sync-all (o cron que roda pra todo mundo).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { StravaApiError, StravaNotConnectedError, needsTokenRefresh, syncStravaForUser, toActivityRow } from '../_shared/stravaSync.ts';

// Re-exportados só pra manter compatibilidade com o teste existente desta
// função — a fonte da verdade é o módulo compartilhado.
export { needsTokenRefresh, toActivityRow };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

export async function handler(req: Request): Promise<Response> {
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

    const result = await syncStravaForUser(admin, userId);
    return json(result);
  } catch (err) {
    if (err instanceof StravaNotConnectedError) return json({ error: err.message }, 400);
    if (err instanceof StravaApiError) return json({ error: err.message }, 502);
    console.error(err);
    return json({ error: 'Erro inesperado ao sincronizar com o Strava.' }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
