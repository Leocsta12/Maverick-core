import { severityLabel } from '../painLog';

describe('severityLabel', () => {
  it('é "Leve" de 1 a 3', () => {
    expect(severityLabel(1)).toBe('Leve');
    expect(severityLabel(3)).toBe('Leve');
  });

  it('é "Moderada" de 4 a 6', () => {
    expect(severityLabel(4)).toBe('Moderada');
    expect(severityLabel(6)).toBe('Moderada');
  });

  it('é "Forte" de 7 a 10', () => {
    expect(severityLabel(7)).toBe('Forte');
    expect(severityLabel(10)).toBe('Forte');
  });
});
