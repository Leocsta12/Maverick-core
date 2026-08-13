// Testes da Edge Function strava-oauth-callback (Deno). Rode com:
//   deno test --allow-net --allow-env supabase/functions/strava-oauth-callback
//
// Só os ramos do handler que retornam ANTES de tocar em Supabase/Strava de
// verdade são testados aqui — trocar o código de autorização por um token
// exige a API real do Strava, fora de escopo pra um teste automatizado.

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import { handler, htmlPage } from '../index.ts';

Deno.test('htmlPage inclui o título e a mensagem no HTML', async () => {
  const res = htmlPage('Conexão cancelada', 'Você não autorizou o acesso.');
  assertEquals(res.headers.get('content-type'), 'text/html; charset=utf-8');
  const body = await res.text();
  assertStringIncludes(body, 'Conexão cancelada');
  assertStringIncludes(body, 'Você não autorizou o acesso.');
});

Deno.test('htmlPage sempre devolve status 200 — mesmo pra páginas de erro (é HTML pro navegador, não uma API)', () => {
  const res = htmlPage('Erro', 'msg');
  assertEquals(res.status, 200);
});

Deno.test('handler: mostra página de "conexão cancelada" quando o Strava manda ?error=', async () => {
  const req = new Request('https://example.com/callback?error=access_denied');
  const res = await handler(req);
  const body = await res.text();
  assertStringIncludes(body, 'Conexão cancelada');
});

Deno.test('handler: mostra página de "link inválido" quando faltam code/state', async () => {
  const req = new Request('https://example.com/callback');
  const res = await handler(req);
  const body = await res.text();
  assertStringIncludes(body, 'Link inválido');
});

Deno.test('handler: prioriza o erro do Strava mesmo se code/state também estiverem ausentes', async () => {
  const req = new Request('https://example.com/callback?error=access_denied');
  const res = await handler(req);
  const body = await res.text();
  assertStringIncludes(body, 'Conexão cancelada');
});
