// Testes de src/lib/periodization.ts — detectDeloadStatus. O que mais
// importa: achar corretamente a deload mais recente numa série de
// semanas, e o ACWR "alto" sempre vencer a cadência normal quando os dois
// sinais discordam (segurança primeiro).

import { detectDeloadStatus, type WeeklyLoadPoint } from '../periodization';

const week = (weekStartIso: string, totalLoad: number): WeeklyLoadPoint => ({ weekStartIso, totalLoad });

describe('detectDeloadStatus', () => {
  it('com menos de 2 semanas de histórico, não recomenda nada e avisa que falta dado', () => {
    const result = detectDeloadStatus([week('2026-08-17', 100)]);
    expect(result.recommended).toBe(false);
    expect(result.weeksSinceLastDeload).toBeNull();
    expect(result.message).toContain('não há semanas suficientes');
  });

  it('com histórico vazio, também não recomenda nada', () => {
    expect(detectDeloadStatus([]).weeksSinceLastDeload).toBeNull();
  });

  it('identifica uma queda de carga (<=60% da semana anterior) como uma deload já feita', () => {
    const weeks = [week('2026-07-27', 300), week('2026-08-03', 320), week('2026-08-10', 150), week('2026-08-17', 200)];
    const result = detectDeloadStatus(weeks);
    // A deload foi há 2 semanas (na posição de 2026-08-10); 2026-08-17 é a semana seguinte.
    expect(result.weeksSinceLastDeload).toBe(1);
    expect(result.recommended).toBe(false); // 1 semana depois de uma deload, ainda dentro do esperado
  });

  it('recomenda deload quando já se passaram 4+ semanas sem nenhuma queda de carga', () => {
    const weeks = [week('s1', 200), week('s2', 220), week('s3', 240), week('s4', 260), week('s5', 280)];
    const result = detectDeloadStatus(weeks);
    expect(result.weeksSinceLastDeload).toBe(4);
    expect(result.recommended).toBe(true);
    expect(result.message).toContain('4 semanas');
  });

  it('não recomenda ainda quando está a 1-3 semanas de uma deload (dentro do padrão de 3-4 semanas de bloco)', () => {
    const weeks = [week('s1', 200), week('s2', 220), week('s3', 240)];
    const result = detectDeloadStatus(weeks);
    expect(result.weeksSinceLastDeload).toBe(2);
    expect(result.recommended).toBe(false);
    expect(result.message).toContain('Em 2 semana(s)');
  });

  it('recomenda deload imediatamente quando o ACWR atual está em risco alto, mesmo recém saído de uma deload', () => {
    const weeks = [week('s1', 300), week('s2', 150)]; // deload na semana mais recente
    const result = detectDeloadStatus(weeks, 'alto');
    expect(result.recommended).toBe(true);
    expect(result.message).toContain('Risco de carga alto');
  });

  it('ACWR "ideal" ou "baixa" não força recomendação por si só — só a cadência de semanas decide', () => {
    const weeks = [week('s1', 200), week('s2', 220)];
    const result = detectDeloadStatus(weeks, 'ideal');
    expect(result.recommended).toBe(false);
  });

  it('acha a deload MAIS RECENTE quando há mais de uma queda no histórico', () => {
    const weeks = [
      week('s1', 300),
      week('s2', 150), // primeira deload
      week('s3', 200),
      week('s4', 220),
      week('s5', 100), // segunda (mais recente) deload
      week('s6', 150),
    ];
    const result = detectDeloadStatus(weeks);
    expect(result.weeksSinceLastDeload).toBe(1); // conta a partir da SEGUNDA deload (s5), não da primeira
  });

  it('carga zero na semana anterior nunca conta como base pra detectar deload (evita divisão por zero silenciosa)', () => {
    const weeks = [week('s1', 0), week('s2', 50), week('s3', 60), week('s4', 70), week('s5', 80)];
    const result = detectDeloadStatus(weeks);
    // Nenhuma detecção de deload deveria vir da comparação com a semana de carga 0 — conta desde o início.
    expect(result.weeksSinceLastDeload).toBe(4);
  });
});
