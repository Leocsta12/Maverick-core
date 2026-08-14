// Testes da Edge Function strava-sync (Deno). Rode com:
//   deno test --allow-net --allow-env supabase/functions/strava-sync
//
// toActivityRow e needsTokenRefresh moram em ../../_shared/stravaSync.ts
// (compartilhadas com strava-sync-all) — cobertas com mais detalhe em
// _shared/__tests__/stravaSync.test.ts. Aqui só um teste de sanidade pra
// confirmar que o re-export continua funcionando, mais os ramos do handler
// que retornam antes de precisar de Strava/Supabase de verdade.

import { assertEquals } from 'jsr:@std/assert';
import { handler, needsTokenRefresh, toActivityRow } from '../index.ts';

Deno.test('toActivityRow: re-exportado de _shared/stravaSync.ts continua funcionando', () => {
  const row = toActivityRow('u1', { id: 123, type: 'Run' });
  assertEquals(row.activity_type, 'Run');
  assertEquals(row.strava_activity_id, 123);
});

Deno.test('needsTokenRefresh: re-exportado de _shared/stravaSync.ts continua funcionando', () => {
  const now = Date.parse('2024-06-10T12:00:00Z');
  assertEquals(needsTokenRefresh(new Date(now - 60 * 1000).toISOString(), now), true);
});

Deno.test('handler: responde OPTIONS pro CORS preflight sem exigir autenticação', async () => {
  const req = new Request('https://example.com/sync', { method: 'OPTIONS' });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), 'ok');
});

Deno.test('handler: recusa sem header Authorization', async () => {
  const req = new Request('https://example.com/sync', { method: 'POST' });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Não autenticado.');
});
