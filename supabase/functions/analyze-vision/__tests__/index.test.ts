// Testes da Edge Function analyze-vision (Deno). Rode com:
//   deno test --allow-net --allow-env supabase/functions/analyze-vision
//
// toBase64 é testado com um Supabase Storage falso (só precisa da mesma
// forma — .storage.from(bucket).download(path) — não precisa ser o client
// de verdade). O handler em si só é testado nos ramos que retornam antes
// de precisar de Supabase/Claude de verdade.

import { assertEquals, assertRejects } from 'jsr:@std/assert';
import { handler, json, toBase64 } from '../index.ts';

function fakeStorage(result: { data: { arrayBuffer: () => Promise<ArrayBuffer> } | null; error: Error | null }) {
  return {
    storage: {
      from: (_bucket: string) => ({
        download: async (_path: string) => result,
      }),
    },
  };
}

Deno.test('toBase64: converte os bytes baixados do Storage em base64', async () => {
  const bytes = new TextEncoder().encode('Hello');
  const fake = fakeStorage({ data: { arrayBuffer: async () => bytes.buffer }, error: null });

  const result = await toBase64(fake, 'user1/photo.jpg');

  assertEquals(result, btoa('Hello'));
});

Deno.test('toBase64: lança erro claro quando o download falha', async () => {
  const fake = fakeStorage({ data: null, error: new Error('not found') });

  await assertRejects(() => toBase64(fake, 'user1/inexistente.jpg'), Error, 'Falha ao baixar imagem');
});

Deno.test('json: monta a resposta com content-type JSON e o status pedido', async () => {
  const res = json({ ok: true }, 201);
  assertEquals(res.status, 201);
  assertEquals(res.headers.get('content-type'), 'application/json');
  assertEquals(await res.json(), { ok: true });
});

Deno.test('json: usa status 200 por padrão', () => {
  const res = json({ ok: true });
  assertEquals(res.status, 200);
});

Deno.test('handler: responde OPTIONS pro CORS preflight sem exigir corpo nem autenticação', async () => {
  const req = new Request('https://example.com/fn', { method: 'OPTIONS' });
  const res = await handler(req);
  assertEquals(res.status, 200);
});

Deno.test('handler: exige photoAId e photoBId no corpo antes de checar autenticação', async () => {
  const req = new Request('https://example.com/fn', { method: 'POST', body: JSON.stringify({}) });
  const res = await handler(req);
  assertEquals(res.status, 400);
});

Deno.test('handler: recusa sem header Authorization mesmo com IDs de foto válidos', async () => {
  const req = new Request('https://example.com/fn', {
    method: 'POST',
    body: JSON.stringify({ photoAId: 'a', photoBId: 'b' }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});
