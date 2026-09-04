import { formatMMSS } from '../RestTimer';

describe('formatMMSS', () => {
  it('formata segundos abaixo de um minuto', () => {
    expect(formatMMSS(45)).toBe('0:45');
    expect(formatMMSS(5)).toBe('0:05');
  });

  it('formata minutos e segundos', () => {
    expect(formatMMSS(90)).toBe('1:30');
    expect(formatMMSS(125)).toBe('2:05');
  });

  it('é 0:00 no zero', () => {
    expect(formatMMSS(0)).toBe('0:00');
  });

  it('nunca fica negativo', () => {
    expect(formatMMSS(-5)).toBe('0:00');
  });

  it('arredonda frações de segundo', () => {
    expect(formatMMSS(59.6)).toBe('1:00');
  });
});
