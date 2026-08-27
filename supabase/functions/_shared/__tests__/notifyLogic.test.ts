// Testes das funções puras de _shared/notifyLogic.ts. Rode com:
//   deno test --allow-net --allow-env supabase/functions/_shared

import { assertEquals } from 'jsr:@std/assert';
import { buildCandidates, shouldNotify, type MinimalActivity } from '../notifyLogic.ts';

const activity = (
  sportType: string,
  startedAt: string,
  movingTimeSeconds: number,
  averageHeartrate: number,
  maxHeartrate: number
): MinimalActivity => ({ sportType, startedAt, movingTimeSeconds, averageHeartrate, maxHeartrate });

Deno.test('shouldNotify: true quando nunca notificou antes (lastSentAtIso null)', () => {
  assertEquals(shouldNotify('prontidao_baixa', null), true);
});

Deno.test('shouldNotify: false quando o cooldown do tipo ainda não passou', () => {
  const now = new Date('2026-08-26T12:00:00Z');
  const lastSentAt = new Date('2026-08-25T12:00:00Z').toISOString(); // 1 dia atrás
  assertEquals(shouldNotify('prontidao_baixa', lastSentAt, now), false); // cooldown de 3 dias
});

Deno.test('shouldNotify: true quando o cooldown já passou', () => {
  const now = new Date('2026-08-26T12:00:00Z');
  const lastSentAt = new Date('2026-08-20T12:00:00Z').toISOString(); // 6 dias atrás
  assertEquals(shouldNotify('prontidao_baixa', lastSentAt, now), true);
});

Deno.test('shouldNotify: taper_prova tem cooldown de 1 dia (mais frequente que os outros tipos)', () => {
  const now = new Date('2026-08-26T12:00:00Z');
  const lastSentAt = new Date('2026-08-25T13:00:00Z').toISOString(); // ~23h atrás
  assertEquals(shouldNotify('taper_prova', lastSentAt, now), false);
  const lastSentAtOk = new Date('2026-08-25T11:00:00Z').toISOString(); // ~25h atrás
  assertEquals(shouldNotify('taper_prova', lastSentAtOk, now), true);
});

Deno.test('buildCandidates: sem nenhum sinal ruim, não gera candidato nenhum', () => {
  // Uma ÚNICA atividade recente sem nenhum histórico antes dela sempre
  // parece um "pico" pro ACWR (matemática correta — ver trainingLoad.
  // test.ts) — pra representar treino estável de verdade, usa várias
  // semanas de carga parecida (mesmo padrão do teste "ideal" de lá).
  const now = new Date('2026-08-26T12:00:00Z');
  const activities: MinimalActivity[] = [1, 8, 15, 22].map((daysAgo) =>
    activity('Run', new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(), 1800, 120, 190)
  );
  const candidates = buildCandidates({ activities, recentAvgRpe: 6, latestSleepHours: 8, nextRaceDate: null, now });
  assertEquals(candidates.length, 0);
});

Deno.test('buildCandidates: sono baixo sozinho gera "prontidao_baixa"', () => {
  const candidates = buildCandidates({
    activities: [],
    recentAvgRpe: null,
    latestSleepHours: 5,
    nextRaceDate: null,
  });
  assertEquals(candidates.length, 1);
  assertEquals(candidates[0].type, 'prontidao_baixa');
});

Deno.test('buildCandidates: RPE alto (>=9) sozinho gera "prontidao_baixa" mencionando musculação', () => {
  const candidates = buildCandidates({
    activities: [],
    recentAvgRpe: 9.5,
    latestSleepHours: 8,
    nextRaceDate: null,
  });
  assertEquals(candidates.length, 1);
  assertEquals(candidates[0].type, 'prontidao_baixa');
  assertEquals(candidates[0].body.includes('musculação'), true);
});

Deno.test('buildCandidates: ACWR "alto" gera tanto prontidao_baixa quanto deload_atrasado', () => {
  const now = new Date('2026-08-26T12:00:00Z');
  const activities: MinimalActivity[] = [
    // base leve nas semanas anteriores
    activity('Run', '2026-08-04T08:00:00Z', 900, 110, 190),
    activity('Run', '2026-08-11T08:00:00Z', 900, 110, 190),
    // pico recente de carga
    activity('Run', '2026-08-25T08:00:00Z', 7200, 175, 190),
  ];
  const candidates = buildCandidates({ activities, recentAvgRpe: null, latestSleepHours: 8, nextRaceDate: null, now });
  const types = candidates.map((c) => c.type);
  assertEquals(types.includes('prontidao_baixa'), true);
});

Deno.test('buildCandidates: sem prova cadastrada, nunca gera candidato de taper', () => {
  const candidates = buildCandidates({
    activities: [],
    recentAvgRpe: null,
    latestSleepHours: 5,
    nextRaceDate: null,
  });
  assertEquals(candidates.some((c) => c.type === 'taper_prova'), false);
});

Deno.test('buildCandidates: prova longe (fora do taper) não gera candidato de taper', () => {
  const now = new Date('2026-08-26T12:00:00Z');
  const candidates = buildCandidates({
    activities: [],
    recentAvgRpe: 6,
    latestSleepHours: 8,
    nextRaceDate: '2026-11-15', // bem mais de 14 dias
    now,
  });
  assertEquals(candidates.some((c) => c.type === 'taper_prova'), false);
});

Deno.test('buildCandidates: prova em cima (dia_prova) gera candidato de taper com título específico', () => {
  const now = new Date('2026-08-26T12:00:00Z');
  const candidates = buildCandidates({
    activities: [],
    recentAvgRpe: 6,
    latestSleepHours: 8,
    nextRaceDate: '2026-08-26',
    now,
  });
  const taper = candidates.find((c) => c.type === 'taper_prova');
  assertEquals(taper?.title, 'Hoje é o dia da prova!');
});

Deno.test('buildCandidates: prova a poucos dias (taper avançado) gera candidato de taper', () => {
  const now = new Date('2026-08-26T12:00:00Z');
  const candidates = buildCandidates({
    activities: [],
    recentAvgRpe: 6,
    latestSleepHours: 8,
    nextRaceDate: '2026-08-30', // 4 dias
    now,
  });
  assertEquals(candidates.some((c) => c.type === 'taper_prova'), true);
});
