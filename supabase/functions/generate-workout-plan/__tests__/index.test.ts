// Testes da Edge Function generate-workout-plan (Deno). Rode com:
//   deno test --allow-net --allow-env supabase/functions/generate-workout-plan
//
// buildUserMessage/buildCatalogText/isValidLevel são o que decide o que a
// IA vai ler — testados sem chamar a Claude API de verdade. O handler em
// si só é testado nos ramos que retornam antes de precisar de
// Supabase/Claude (autenticação, CORS).

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import { buildCatalogText, buildUserMessage, handler, isValidLevel } from '../index.ts';

Deno.test('isValidLevel: aceita os três níveis válidos', () => {
  assertEquals(isValidLevel('iniciante'), true);
  assertEquals(isValidLevel('intermediario'), true);
  assertEquals(isValidLevel('avancado'), true);
});

Deno.test('isValidLevel: rejeita nível inválido, vazio ou ausente', () => {
  assertEquals(isValidLevel('avançado'), false); // com acento não bate com o valor esperado no banco
  assertEquals(isValidLevel(''), false);
  assertEquals(isValidLevel(undefined), false);
  assertEquals(isValidLevel(123), false);
});

Deno.test('buildCatalogText: lista os exercícios com grupo muscular quando informado', () => {
  const text = buildCatalogText([
    { name: 'Supino reto', muscleGroup: 'Peito' },
    { name: 'Corrida leve', muscleGroup: null },
  ]);
  assertStringIncludes(text, '- Supino reto (Peito)');
  assertStringIncludes(text, '- Corrida leve');
});

Deno.test('buildCatalogText: avisa que o catálogo está vazio em vez de mandar uma lista em branco', () => {
  const text = buildCatalogText([]);
  assertStringIncludes(text, 'catálogo vazio');
});

Deno.test('buildUserMessage: nunca menciona carga/peso — a regra "sem carga" também vale na própria mensagem', () => {
  const msg = buildUserMessage({ level: 'intermediario', daysPerWeek: 4, catalog: [] });
  assertEquals(msg.toLowerCase().includes(' kg'), false);
});

Deno.test('buildUserMessage: inclui nível, dias de treino e objetivo quando informado', () => {
  const msg = buildUserMessage({ level: 'avancado', goal: 'hipertrofia', daysPerWeek: 5, catalog: [] });
  assertStringIncludes(msg, 'Nível do atleta: avancado');
  assertStringIncludes(msg, 'Dias de treino por semana: 5');
  assertStringIncludes(msg, 'Objetivo: hipertrofia');
});

Deno.test('buildUserMessage: usa mensagem padrão quando objetivo e equipamento não são informados', () => {
  const msg = buildUserMessage({ level: 'iniciante', daysPerWeek: 3, catalog: [] });
  assertStringIncludes(msg, 'Objetivo: não informado');
  assertStringIncludes(msg, 'Equipamento disponível: não informado');
});

Deno.test('buildUserMessage: calcula os dias de descanso a partir dos dias de treino pedidos', () => {
  const msg = buildUserMessage({ level: 'iniciante', daysPerWeek: 4, catalog: [] });
  assertStringIncludes(msg, 'os outros 3 dias da semana devem ser descanso');
});

Deno.test('handler: responde OPTIONS pro CORS preflight sem exigir autenticação', async () => {
  const req = new Request('https://example.com/fn', { method: 'OPTIONS' });
  const res = await handler(req);
  assertEquals(res.status, 200);
});

Deno.test('handler: recusa sem header Authorization', async () => {
  const req = new Request('https://example.com/fn', { method: 'POST', body: '{}' });
  const res = await handler(req);
  assertEquals(res.status, 401);
});
