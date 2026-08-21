// Testes das funções puras de _shared/stravaSync.ts (Deno). Rode com:
//   deno test --allow-net --allow-env supabase/functions/_shared
//
// toActivityRow e needsTokenRefresh são onde os bugs de fallback ("o
// Strava não mandou esse campo, o que eu gravo?") realmente moram —
// syncStravaForUser em si não é testada aqui porque depende de um client
// de service_role e da API real do Strava (coberta pelos ramos de handler
// que retornam antes disso, em strava-sync e strava-sync-all).

import { assertEquals } from 'jsr:@std/assert';
import { needsTokenRefresh, toActivityRow } from '../stravaSync.ts';

Deno.test('toActivityRow: usa sport_type quando "type" não vem', () => {
  const row = toActivityRow('u1', {
    id: 123,
    sport_type: 'Run',
    name: 'Corrida',
    distance: 5000,
    moving_time: 1800,
    start_date: '2024-06-01T10:00:00Z',
  });
  assertEquals(row.activity_type, 'Run');
  assertEquals(row.strava_activity_id, 123);
  assertEquals(row.distance_m, 5000);
  assertEquals(row.user_id, 'u1');
});

Deno.test('toActivityRow: cai pra "Activity" quando nem type nem sport_type vêm', () => {
  const row = toActivityRow('u1', { id: 1 });
  assertEquals(row.activity_type, 'Activity');
});

Deno.test('toActivityRow: campos numéricos ausentes viram null, não undefined (undefined quebraria o upsert)', () => {
  const row = toActivityRow('u1', { id: 1 });
  assertEquals(row.distance_m, null);
  assertEquals(row.moving_time_s, null);
  assertEquals(row.calories, null);
  assertEquals(row.average_heartrate, null);
  assertEquals(row.max_heartrate, null);
  assertEquals(row.average_speed_ms, null);
  assertEquals(row.max_speed_ms, null);
  assertEquals(row.average_watts, null);
  assertEquals(row.weighted_average_watts, null);
  assertEquals(row.average_cadence, null);
  assertEquals(row.total_elevation_gain_m, null);
  assertEquals(row.sport_type, null);
});

Deno.test('toActivityRow: name vazio quando ausente, não undefined', () => {
  const row = toActivityRow('u1', { id: 1 });
  assertEquals(row.name, '');
});

Deno.test('toActivityRow: captura métricas de endurance (pedal com potência) quando o Strava manda', () => {
  const row = toActivityRow('u1', {
    id: 9,
    type: 'Ride',
    sport_type: 'Ride',
    distance: 40000,
    moving_time: 5400,
    average_speed: 7.4,
    max_speed: 15.2,
    average_watts: 185.3,
    weighted_average_watts: 201,
    average_cadence: 84,
    average_heartrate: 142,
    max_heartrate: 168,
    total_elevation_gain: 320,
    start_date: '2024-06-01T10:00:00Z',
  });
  assertEquals(row.sport_type, 'Ride');
  assertEquals(row.average_speed_ms, 7.4);
  assertEquals(row.max_speed_ms, 15.2);
  assertEquals(row.average_watts, 185.3);
  assertEquals(row.weighted_average_watts, 201);
  assertEquals(row.average_cadence, 84);
  assertEquals(row.max_heartrate, 168);
  assertEquals(row.total_elevation_gain_m, 320);
});

Deno.test('toActivityRow: sport_type cai pra "type" quando o Strava não manda sport_type', () => {
  const row = toActivityRow('u1', { id: 1, type: 'Run' });
  assertEquals(row.sport_type, 'Run');
});

Deno.test('needsTokenRefresh: true quando falta menos de 5 minutos pra expirar', () => {
  const now = Date.parse('2024-06-10T12:00:00Z');
  const expiresAt = new Date(now + 3 * 60 * 1000).toISOString();
  assertEquals(needsTokenRefresh(expiresAt, now), true);
});

Deno.test('needsTokenRefresh: false quando falta bastante tempo', () => {
  const now = Date.parse('2024-06-10T12:00:00Z');
  const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();
  assertEquals(needsTokenRefresh(expiresAt, now), false);
});

Deno.test('needsTokenRefresh: true quando o token já expirou', () => {
  const now = Date.parse('2024-06-10T12:00:00Z');
  const expiresAt = new Date(now - 60 * 1000).toISOString();
  assertEquals(needsTokenRefresh(expiresAt, now), true);
});

Deno.test('needsTokenRefresh: exatamente na margem de 5 min conta como "precisa renovar"', () => {
  const now = Date.parse('2024-06-10T12:00:00Z');
  const expiresAt = new Date(now + 5 * 60 * 1000).toISOString();
  assertEquals(needsTokenRefresh(expiresAt, now), false); // igual à margem = ainda não passou do limite
});
