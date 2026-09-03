import { groupSessionsByDay, summarizeSession, type EnduranceSession } from '../endurancePlan';

function session(overrides: Partial<EnduranceSession> = {}): EnduranceSession {
  return {
    id: '1',
    userId: 'u1',
    dayOfWeek: 2,
    sport: 'corrida',
    workoutType: 'rodagem',
    targetZone: null,
    targetPace: null,
    plannedDistanceKm: null,
    plannedDurationMin: null,
    structureNotes: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe('groupSessionsByDay', () => {
  it('agrupa sessões pelo dia da semana certo', () => {
    const sessions = [session({ id: 'a', dayOfWeek: 2 }), session({ id: 'b', dayOfWeek: 2 }), session({ id: 'c', dayOfWeek: 5 })];
    const byDay = groupSessionsByDay(sessions);
    expect(byDay[2].map((s) => s.id)).toEqual(['a', 'b']);
    expect(byDay[5].map((s) => s.id)).toEqual(['c']);
  });

  it('sempre tem as 7 chaves (0-6), mesmo sem sessão nenhuma naquele dia', () => {
    const byDay = groupSessionsByDay([]);
    expect(Object.keys(byDay).map(Number).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(byDay[0]).toEqual([]);
  });
});

describe('summarizeSession', () => {
  it('junta só as partes que têm dado, na ordem distância/duração/zona/pace', () => {
    expect(summarizeSession(session({ plannedDistanceKm: 8, targetZone: 2, targetPace: '5:30/km' }))).toBe('8km · Z2 · 5:30/km');
  });

  it('é vazio quando não há nenhum alvo definido', () => {
    expect(summarizeSession(session())).toBe('');
  });

  it('só distância', () => {
    expect(summarizeSession(session({ plannedDistanceKm: 18 }))).toBe('18km');
  });

  it('só duração', () => {
    expect(summarizeSession(session({ plannedDurationMin: 45 }))).toBe('45min');
  });
});
