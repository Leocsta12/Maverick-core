import { MissionCompletion, computeStreak } from '../mission';

// "Hoje" é sempre relativo a `new Date()` dentro de computeStreak — fixamos
// o relógio do sistema pra cada teste ser determinístico (sem depender do
// dia em que o teste é rodado).
const TODAY = '2024-06-10'; // uma segunda-feira

function completion(daysAgo: number): MissionCompletion {
  const date = new Date(`${TODAY}T12:00:00`);
  date.setDate(date.getDate() - daysAgo);
  return { habitId: 'h1', completedDate: date.toISOString().slice(0, 10) };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(`${TODAY}T12:00:00`));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('computeStreak', () => {
  it('retorna 0 sem nenhuma conclusão do hábito', () => {
    expect(computeStreak('h1', [])).toBe(0);
  });

  it('ignora conclusões de outros hábitos', () => {
    const completions: MissionCompletion[] = [{ habitId: 'outro-habito', completedDate: TODAY }];
    expect(computeStreak('h1', completions)).toBe(0);
  });

  it('conta dias consecutivos terminando hoje', () => {
    const completions = [completion(0), completion(1), completion(2)];
    expect(computeStreak('h1', completions)).toBe(3);
  });

  it('conta a partir de ontem se hoje ainda não foi marcado (não zera por marcar tarde)', () => {
    const completions = [completion(1), completion(2)];
    expect(computeStreak('h1', completions)).toBe(2);
  });

  it('para no primeiro dia faltante — um buraco no meio quebra a sequência', () => {
    const completions = [completion(0), completion(2)]; // hoje e anteontem, sem ontem
    expect(computeStreak('h1', completions)).toBe(1);
  });

  it('zera se o último registro foi há mais de 1 dia', () => {
    const completions = [completion(3)];
    expect(computeStreak('h1', completions)).toBe(0);
  });
});
