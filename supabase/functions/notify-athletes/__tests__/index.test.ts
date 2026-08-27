// Testes da Edge Function notify-athletes (Deno). Rode com:
//   deno test --allow-net --allow-env supabase/functions/notify-athletes
//
// Só o portão de autenticação (segredo compartilhado) é testável sem um
// client de service_role de verdade — o resto (juntar sinais de cada
// usuário, decidir e mandar push) depende do Supabase/Expo reais e já
// está coberto na parte pura em _shared/notifyLogic.ts.

import { assertEquals } from 'jsr:@std/assert';
import { handler } from '../index.ts';

Deno.test('handler: recusa sem o header x-cron-secret', async () => {
  const req = new Request('https://example.com/notify-athletes', { method: 'POST' });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Não autorizado.');
});

Deno.test('handler: recusa com o segredo errado', async () => {
  const req = new Request('https://example.com/notify-athletes', {
    method: 'POST',
    headers: { 'x-cron-secret': 'segredo-errado' },
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

Deno.test('handler: recusa quando CRON_SECRET não está configurado no ambiente (nunca autoriza por engano)', async () => {
  const original = Deno.env.get('CRON_SECRET');
  Deno.env.delete('CRON_SECRET');
  try {
    const req = new Request('https://example.com/notify-athletes', {
      method: 'POST',
      headers: { 'x-cron-secret': '' },
    });
    const res = await handler(req);
    assertEquals(res.status, 401);
  } finally {
    if (original !== undefined) Deno.env.set('CRON_SECRET', original);
  }
});
