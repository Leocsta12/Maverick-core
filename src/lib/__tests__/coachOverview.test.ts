import { athleteRiskStatus, attentionRank, checkInStatus, daysSince, painFlagStatus, type AthleteOverview } from '../coachOverview';

const TODAY = '2024-06-10';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(`${TODAY}T15:30:00`));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('daysSince', () => {
  it('é 0 pra hoje', () => {
    expect(daysSince(TODAY)).toBe(0);
  });

  it('conta dias corretamente ignorando o horário do dia', () => {
    expect(daysSince('2024-06-09')).toBe(1);
    expect(daysSince('2024-06-05')).toBe(5);
  });
});

describe('checkInStatus', () => {
  it('sinaliza "sem atividade registrada" quando nunca houve check-in', () => {
    expect(checkInStatus(null)).toEqual({ label: 'Sem atividade registrada', severity: 'none' });
  });

  it('é "ok" pra hoje e ontem', () => {
    expect(checkInStatus(TODAY)).toEqual({ label: 'Check-in hoje', severity: 'ok' });
    expect(checkInStatus('2024-06-09')).toEqual({ label: 'Check-in ontem', severity: 'ok' });
  });

  it('é "warn" entre 2 e 3 dias sem check-in', () => {
    expect(checkInStatus('2024-06-08')).toEqual({ label: 'Check-in há 2 dias', severity: 'warn' });
    expect(checkInStatus('2024-06-07')).toEqual({ label: 'Check-in há 3 dias', severity: 'warn' });
  });

  it('é "stale" a partir de 4 dias sem check-in — é isso que o Coach usa pra alertar o treinador', () => {
    expect(checkInStatus('2024-06-06')).toEqual({ label: 'Sem check-in há 4 dias', severity: 'stale' });
    expect(checkInStatus('2024-05-01')).toMatchObject({ severity: 'stale' });
  });
});

describe('athleteRiskStatus', () => {
  const base: AthleteOverview = {
    score: 80,
    lastCheckInDate: '2024-06-10',
    readinessScore: 80,
    acwrRisk: null,
    deloadRecommended: false,
    recentSeverePainCount: 0,
  };

  it('sinaliza "sem dado" quando não há ACWR calculável (sem Strava/FC máxima)', () => {
    expect(athleteRiskStatus(base).severity).toBe('sem_dado');
  });

  it('é "alto" quando o ACWR está em risco alto, mesmo sem deload recomendado', () => {
    const overview = { ...base, acwrRisk: 'alto' as const, deloadRecommended: false };
    expect(athleteRiskStatus(overview)).toEqual({ label: 'Risco de carga alto', severity: 'alto' });
  });

  it('risco "alto" do ACWR vence deload recomendado (mostra o sinal mais grave)', () => {
    const overview = { ...base, acwrRisk: 'alto' as const, deloadRecommended: true };
    expect(athleteRiskStatus(overview).severity).toBe('alto');
  });

  it('é "atencao" quando o deload está recomendado, mesmo com ACWR "ideal"', () => {
    const overview = { ...base, acwrRisk: 'ideal' as const, deloadRecommended: true };
    expect(athleteRiskStatus(overview)).toEqual({ label: 'Deload recomendado', severity: 'atencao' });
  });

  it('é "atencao" quando o ACWR está subindo rápido, mesmo sem deload recomendado', () => {
    const overview = { ...base, acwrRisk: 'atencao' as const, deloadRecommended: false };
    expect(athleteRiskStatus(overview)).toEqual({ label: 'Carga subindo rápido', severity: 'atencao' });
  });

  it('é "ok" quando o ACWR está ideal ou baixo e não há deload recomendado', () => {
    expect(athleteRiskStatus({ ...base, acwrRisk: 'ideal', deloadRecommended: false }).severity).toBe('ok');
    expect(athleteRiskStatus({ ...base, acwrRisk: 'baixa', deloadRecommended: false }).severity).toBe('ok');
  });
});

describe('painFlagStatus', () => {
  const base: AthleteOverview = {
    score: 80,
    lastCheckInDate: '2024-06-10',
    readinessScore: 80,
    acwrRisk: 'ideal',
    deloadRecommended: false,
    recentSeverePainCount: 0,
  };

  it('é "nenhum" sem registro de dor forte recente', () => {
    expect(painFlagStatus(base)).toEqual({ label: 'Sem dor forte recente', severity: 'nenhum' });
  });

  it('é "alto" com pelo menos 1 registro de dor forte recente, no singular', () => {
    expect(painFlagStatus({ ...base, recentSeverePainCount: 1 })).toEqual({
      label: '1 registro de dor forte',
      severity: 'alto',
    });
  });

  it('pluraliza corretamente com mais de 1 registro', () => {
    expect(painFlagStatus({ ...base, recentSeverePainCount: 3 }).label).toBe('3 registros de dor forte');
  });
});

describe('attentionRank', () => {
  const base: AthleteOverview = {
    score: 80,
    lastCheckInDate: '2024-06-10', // "hoje" no relógio congelado do teste — check-in ok
    readinessScore: 80,
    acwrRisk: 'ideal',
    deloadRecommended: false,
    recentSeverePainCount: 0,
  };

  it('tudo em dia (check-in ok, carga ideal) fica no rank mais baixo', () => {
    expect(attentionRank(base)).toBe(0);
  });

  it('dor forte relatada vem em PRIMEIRO lugar — acima até de risco de carga previsto', () => {
    const comDor = { ...base, recentSeverePainCount: 1 };
    const emRisco = { ...base, acwrRisk: 'alto' as const };
    expect(attentionRank(comDor)).toBeGreaterThan(attentionRank(emRisco));
  });

  it('risco de carga alto vem em SEGUNDO lugar — até antes de "sumiu do app"', () => {
    const emRisco = { ...base, acwrRisk: 'alto' as const };
    const sumido = { ...base, lastCheckInDate: '2024-05-01' }; // stale
    expect(attentionRank(emRisco)).toBeGreaterThan(attentionRank(sumido));
  });

  it('"sumiu do app" (check-in stale) vem antes de deload/atenção', () => {
    const sumido = { ...base, lastCheckInDate: '2024-05-01' };
    const deload = { ...base, deloadRecommended: true };
    expect(attentionRank(sumido)).toBeGreaterThan(attentionRank(deload));
  });

  it('deload recomendado ou ACWR "atencao" rankeiam igual, acima de check-in "warn"', () => {
    const deload = { ...base, deloadRecommended: true };
    const acwrAtencao = { ...base, acwrRisk: 'atencao' as const };
    const warn = { ...base, lastCheckInDate: '2024-06-08' }; // 2 dias atrás = warn
    expect(attentionRank(deload)).toBe(attentionRank(acwrAtencao));
    expect(attentionRank(deload)).toBeGreaterThan(attentionRank(warn));
  });
});
