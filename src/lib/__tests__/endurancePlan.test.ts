import { groupSessionsByDay, matchSessionToActivity, summarizeSession, type ActivityForMatch, type EnduranceSession } from '../endurancePlan';

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

function activity(overrides: Partial<ActivityForMatch> = {}): ActivityForMatch {
  return {
    sportType: 'Run',
    distanceMeters: 8200,
    movingTimeSeconds: 2520, // 42min
    startedAt: '2024-06-11T08:00:00Z',
    ...overrides,
  };
}

describe('matchSessionToActivity', () => {
  const TODAY = '2024-06-13'; // quinta

  it('folga nunca precisa de correspondência', () => {
    const result = matchSessionToActivity(session({ workoutType: 'folga' }), '2024-06-11', [], TODAY);
    expect(result).toEqual({ status: 'folga', actualDistanceKm: null, actualDurationMin: null });
  });

  it('é "cumprido" quando acha atividade do mesmo esporte na mesma data, com distância/duração convertidas', () => {
    const result = matchSessionToActivity(session({ sport: 'corrida' }), '2024-06-11', [activity()], TODAY);
    expect(result).toEqual({ status: 'cumprido', actualDistanceKm: 8.2, actualDurationMin: 42 });
  });

  it('não confunde esportes diferentes na mesma data', () => {
    const result = matchSessionToActivity(session({ sport: 'bike' }), '2024-06-11', [activity({ sportType: 'Run' })], TODAY);
    expect(result.status).toBe('nao_registrado');
  });

  it('não confunde datas diferentes do mesmo esporte', () => {
    const result = matchSessionToActivity(session({ sport: 'corrida' }), '2024-06-12', [activity({ startedAt: '2024-06-11T08:00:00Z' })], TODAY);
    expect(result.status).toBe('nao_registrado');
  });

  it('é "pendente" (não "não registrado") pra hoje e dias futuros sem atividade ainda', () => {
    expect(matchSessionToActivity(session(), TODAY, [], TODAY).status).toBe('pendente');
    expect(matchSessionToActivity(session(), '2024-06-14', [], TODAY).status).toBe('pendente');
  });

  it('é "não registrado" só pra dias estritamente passados sem correspondência', () => {
    expect(matchSessionToActivity(session(), '2024-06-10', [], TODAY).status).toBe('nao_registrado');
  });
});
