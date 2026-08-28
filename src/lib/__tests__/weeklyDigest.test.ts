import { buildWeeklyDigest, trendDirection } from '../weeklyDigest';
import type { WeeklyLoad } from '../trainingLoad';
import type { WeeklyMuscleVolume } from '../muscleVolume';
import type { HealthEntry } from '../health';

// Quinta-feira, 2024-06-13 — semana atual começa segunda 2024-06-10.
const NOW = new Date('2024-06-13T12:00:00');

function healthEntry(entryDate: string, overrides: Partial<HealthEntry> = {}): HealthEntry {
  return {
    id: entryDate,
    entryDate,
    sleepHours: 8,
    hrvMs: null,
    restingHr: null,
    steps: 8000,
    weightKg: null,
    bodyFatPct: null,
    ...overrides,
  };
}

describe('trendDirection', () => {
  it('é "subindo" quando a variação passa da tolerância', () => {
    expect(trendDirection(120, 100)).toBe('subindo');
  });

  it('é "caindo" quando a variação cai abaixo da tolerância negativa', () => {
    expect(trendDirection(80, 100)).toBe('caindo');
  });

  it('é "estavel" dentro da tolerância (ruído normal de semana pra semana)', () => {
    expect(trendDirection(105, 100)).toBe('estavel');
    expect(trendDirection(96, 100)).toBe('estavel');
  });

  it('é "estavel" quando falta um dos dois pontos ou a base é zero', () => {
    expect(trendDirection(null, 100)).toBe('estavel');
    expect(trendDirection(100, null)).toBe('estavel');
    expect(trendDirection(100, 0)).toBe('estavel');
  });
});

describe('buildWeeklyDigest', () => {
  const loadWeeks: WeeklyLoad[] = [
    { weekStartIso: '2024-06-03', totalLoad: 200, loadBySport: {} }, // semana passada
    { weekStartIso: '2024-06-10', totalLoad: 260, loadBySport: {} }, // semana atual
  ];

  const volumeWeeks: WeeklyMuscleVolume[] = [
    { weekStartIso: '2024-06-03', setsByMuscle: { peito: 6, costas: 6 } }, // 12 séries
    { weekStartIso: '2024-06-10', setsByMuscle: { peito: 4, costas: 5 } }, // 9 séries
  ];

  it('pega carga e volume da semana atual/anterior pela data certa, com tendência derivada', () => {
    const digest = buildWeeklyDigest({ loadWeeks, volumeWeeks, mealDatesThisWeek: [], healthEntries: [], now: NOW });
    expect(digest.weekStartIso).toBe('2024-06-10');
    expect(digest.load).toEqual({ current: 260, previous: 200, trend: 'subindo' });
    expect(digest.volume).toEqual({ current: 9, previous: 12, trend: 'caindo' });
  });

  it('consistência de nutrição conta só datas dentro da semana atual, sobre os dias já decorridos', () => {
    const digest = buildWeeklyDigest({
      loadWeeks: [],
      volumeWeeks: [],
      mealDatesThisWeek: ['2024-06-10', '2024-06-11', '2024-06-11', '2024-06-03'], // duplicata + data de outra semana
      healthEntries: [],
      now: NOW, // quinta = 4 dias decorridos na semana
    });
    expect(digest.nutritionAdherence).toEqual({ daysLogged: 2, totalDays: 4 });
  });

  it('domingo conta como 7 dias decorridos (semana completa)', () => {
    const sunday = new Date('2024-06-16T12:00:00');
    const digest = buildWeeklyDigest({ loadWeeks: [], volumeWeeks: [], mealDatesThisWeek: [], healthEntries: [], now: sunday });
    expect(digest.nutritionAdherence.totalDays).toBe(7);
  });

  it('prontidão: média dos scores diários dentro da semana, comparada com a semana anterior', () => {
    const healthEntries: HealthEntry[] = [
      healthEntry('2024-06-03', { sleepHours: 8, steps: 8000 }), // semana passada — score alto
      healthEntry('2024-06-10', { sleepHours: 4, steps: 2000 }), // semana atual — score baixo
      healthEntry('2024-06-11', { sleepHours: 4, steps: 2000 }),
    ];
    const digest = buildWeeklyDigest({ loadWeeks: [], volumeWeeks: [], mealDatesThisWeek: [], healthEntries, now: NOW });
    expect(digest.readiness.current).not.toBeNull();
    expect(digest.readiness.previous).not.toBeNull();
    expect(digest.readiness.current!).toBeLessThan(digest.readiness.previous!);
    expect(digest.readiness.trend).toBe('caindo');
  });

  it('sem nenhum dado, tudo vem null/vazio sem quebrar', () => {
    const digest = buildWeeklyDigest({ loadWeeks: [], volumeWeeks: [], mealDatesThisWeek: [], healthEntries: [], now: NOW });
    expect(digest.load).toEqual({ current: null, previous: null, trend: 'estavel' });
    expect(digest.volume).toEqual({ current: null, previous: null, trend: 'estavel' });
    expect(digest.readiness).toEqual({ current: null, previous: null, trend: 'estavel' });
    expect(digest.nutritionAdherence).toEqual({ daysLogged: 0, totalDays: 4 });
  });
});
