// Testes de src/lib/taper.ts — computeTaperStatus. O que mais importa:
// os limites exatos de cada fase e a pegadinha de fuso-horário com data
// "só dia" (mesma classe de bug já coberta em muscleVolume.test.ts).

import { computeTaperStatus } from '../taper';

describe('computeTaperStatus', () => {
  const today = new Date('2026-08-22T12:00:00');

  it('mais de 14 dias antes da prova: fora do taper', () => {
    const result = computeTaperStatus('2026-09-10', today); // 19 dias
    expect(result.phase).toBe('fora_do_taper');
    expect(result.daysUntilRace).toBe(19);
  });

  it('exatamente 14 dias antes: início do taper', () => {
    const result = computeTaperStatus('2026-09-05', today); // 14 dias
    expect(result.phase).toBe('inicio_taper');
    expect(result.daysUntilRace).toBe(14);
  });

  it('exatamente 15 dias antes: ainda fora do taper (limite não incluído)', () => {
    const result = computeTaperStatus('2026-09-06', today); // 15 dias
    expect(result.phase).toBe('fora_do_taper');
  });

  it('exatamente 7 dias antes: taper avançado', () => {
    const result = computeTaperStatus('2026-08-29', today); // 7 dias
    expect(result.phase).toBe('taper_avancado');
    expect(result.daysUntilRace).toBe(7);
  });

  it('exatamente 2 dias antes: semana da prova (ativações curtas)', () => {
    const result = computeTaperStatus('2026-08-24', today); // 2 dias
    expect(result.phase).toBe('semana_prova');
  });

  it('exatamente 3 dias antes: ainda taper avançado (limite não incluído em semana_prova)', () => {
    const result = computeTaperStatus('2026-08-25', today); // 3 dias
    expect(result.phase).toBe('taper_avancado');
  });

  it('hoje é o dia da prova', () => {
    const result = computeTaperStatus('2026-08-22', today);
    expect(result.phase).toBe('dia_prova');
    expect(result.daysUntilRace).toBe(0);
    expect(result.message).toContain('Hoje é o dia');
  });

  it('prova já passou: fase de prova concluída, dias negativos', () => {
    const result = computeTaperStatus('2026-08-15', today); // 7 dias atrás
    expect(result.phase).toBe('prova_concluida');
    expect(result.daysUntilRace).toBe(-7);
  });

  it('não empurra a data da prova um dia pra trás por causa de fuso-horário (data "só dia" do Postgres)', () => {
    // Se a data da prova fosse interpretada como meia-noite UTC e o
    // ambiente rodasse num fuso negativo (Brasil), "hoje" (também só-dia)
    // poderia comparar errado e sobrar 1 dia a mais ou a menos.
    const result = computeTaperStatus('2026-08-23', today); // exatamente amanhã
    expect(result.daysUntilRace).toBe(1);
  });
});
