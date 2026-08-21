// Testes de src/lib/readiness.ts — combina recuperação (Maverick Score),
// ACWR de endurance e RPE recente de musculação num score único. O que
// mais importa testar: nunca culpar um sinal AUSENTE (neutro por falta de
// dado) como se fosse um sinal RUIM de verdade.

import { computeReadiness } from '../readiness';

describe('computeReadiness', () => {
  it('sem nenhum dado, devolve score neutro e mensagem pedindo pra registrar', () => {
    const result = computeReadiness({ recoveryScore: null, acwrRisk: null, recentAvgRpe: null });
    expect(result.score).toBe(70);
    expect(result.limitingFactor).toBeNull();
    expect(result.message).toContain('Registre seu sono');
  });

  it('score alto (recuperação boa, ACWR ideal, RPE baixo) dá mensagem de prontidão alta', () => {
    const result = computeReadiness({ recoveryScore: 90, acwrRisk: 'ideal', recentAvgRpe: 6 });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.message).toContain('Prontidão alta');
  });

  it('calcula o score ponderado corretamente (recuperação 50%, ACWR 25%, RPE 25%)', () => {
    // recuperação=80 (peso 0.5) + ACWR 'ideal'=90 (peso 0.25) + RPE baixo=90 (peso 0.25)
    // = 80*0.5 + 90*0.25 + 90*0.25 = 40 + 22.5 + 22.5 = 85
    const result = computeReadiness({ recoveryScore: 80, acwrRisk: 'ideal', recentAvgRpe: 5 });
    expect(result.score).toBe(85);
  });

  it('aponta "recuperacao" como fator limitante quando o sono/HRV está ruim e os outros dois estão bem', () => {
    const result = computeReadiness({ recoveryScore: 30, acwrRisk: 'ideal', recentAvgRpe: 5 });
    expect(result.limitingFactor).toBe('recuperacao');
    expect(result.message).toContain('sono');
  });

  it('aponta "carga_endurance" como fator limitante quando o ACWR está em risco alto', () => {
    const result = computeReadiness({ recoveryScore: 80, acwrRisk: 'alto', recentAvgRpe: 5 });
    expect(result.limitingFactor).toBe('carga_endurance');
    expect(result.message).toContain('corrida/pedal/natação');
  });

  it('aponta "carga_forca" como fator limitante quando o RPE recente de musculação está muito alto', () => {
    const result = computeReadiness({ recoveryScore: 80, acwrRisk: 'ideal', recentAvgRpe: 9.5 });
    expect(result.limitingFactor).toBe('carga_forca');
    expect(result.message).toContain('RPE da musculação');
  });

  it('ACWR "baixa" (destreinando) pontua bem, não é tratado como fadiga', () => {
    const comFolga = computeReadiness({ recoveryScore: 80, acwrRisk: 'baixa', recentAvgRpe: 5 });
    const ideal = computeReadiness({ recoveryScore: 80, acwrRisk: 'ideal', recentAvgRpe: 5 });
    expect(comFolga.score).toBeLessThanOrEqual(ideal.score); // um pouco mais baixo, mas não punitivo
    expect(comFolga.score).toBeGreaterThanOrEqual(75); // ainda conta como prontidão alta
  });

  it('nunca culpa um sinal AUSENTE (neutro por falta de dado) mesmo quando ele "empata" sendo o pior', () => {
    // recoveryScore ausente (vira neutro=70) e acwrRisk ausente (vira neutro=70) — só RPE tem
    // dado de verdade, e é um RPE BOM (baixo) — não deveria sobrar nenhum "culpado".
    const result = computeReadiness({ recoveryScore: null, acwrRisk: null, recentAvgRpe: 5 });
    expect(result.limitingFactor).toBeNull();
  });

  it('quando só a recuperação tem dado (ruim) e o resto está ausente, aponta recuperação mesmo assim', () => {
    const result = computeReadiness({ recoveryScore: 20, acwrRisk: null, recentAvgRpe: null });
    expect(result.limitingFactor).toBe('recuperacao');
  });

  it('score moderado sem nenhum fator abaixo do limiar de "culpa" não aponta fator nenhum', () => {
    // Só a recuperação tem dado de verdade, e não está tão ruim assim
    // (67, acima do limiar de 65) — mesmo o score final caindo na faixa
    // "moderada" pela ponderação, não deveria sobrar um vilão específico.
    const result = computeReadiness({ recoveryScore: 67, acwrRisk: null, recentAvgRpe: null });
    expect(result.score).toBeLessThan(75);
    expect(result.limitingFactor).toBeNull();
    expect(result.message).not.toContain(':');
  });
});
