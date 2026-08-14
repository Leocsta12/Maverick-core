// Maverick Health — sincronização automática do Strava pra todo mundo que
// já conectou. Chamado por um workflow agendado do GitHub Actions (ver
// .github/workflows/strava-auto-sync.yml), não pelo app — por isso não usa
// o JWT de um usuário, e sim um segredo compartilhado (CRON_SECRET) que só
// o workflow e esta função conhecem. `--no-verify-jwt` no deploy porque o
// Supabase não tem por que exigir um JWT de usuário aqui.
//
// A lógica de sincronização em si (renovar token, buscar atividades,
// gravar) mora em ../_shared/stravaSync.ts, compartilhada com strava-sync
// (o botão "Sincronizar" sob demanda em Health).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { syncStravaForUser } from '../_shared/stravaSync.ts';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export async function handler(req: Request): Promise<Response> {
  const expected = Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('x-cron-secret');
  if (!expected || provided !== expected) {
    return json({ error: 'Não autorizado.' }, 401);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: connections, error } = await admin.from('strava_connections').select('user_id');
  if (error) {
    console.error('Erro ao listar strava_connections:', error);
    return json({ error: 'Não foi possível listar as conexões.' }, 500);
  }

  let totalSynced = 0;
  let failed = 0;

  // Sequencial, não em paralelo — a API do Strava tem rate limit por app
  // (não por usuário), então disparar tudo de uma vez arrisca estourar o
  // limite e derrubar a sincronização de todo mundo junto.
  for (const row of connections ?? []) {
    try {
      const result = await syncStravaForUser(admin, row.user_id as string);
      totalSynced += result.synced;
    } catch (err) {
      failed++;
      console.error(`Falha ao sincronizar Strava do usuário ${row.user_id}:`, err);
    }
  }

  return json({ usersProcessed: (connections ?? []).length, totalSynced, failed });
}

if (import.meta.main) {
  Deno.serve(handler);
}
