import { checkInStatus, daysSince } from '../coachOverview';

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
