// Testes das funções puras de formatação/classificação de src/lib/strava.ts.
// Não testa listStravaActivities/connectStrava/etc. (dependem do client do
// Supabase) — só a lógica que decide "o que mostrar pra cada esporte", que
// é onde bug de unidade errada (m/s vs km/h, pace vs velocidade) morde de
// verdade.

import {
  enduranceSportCategory,
  formatCadence,
  formatElevationGain,
  formatPaceMin100m,
  formatPaceMinKm,
  formatPower,
  formatSpeedKmh,
} from '../strava';

describe('enduranceSportCategory', () => {
  it('classifica corrida e variações (trail) como "run"', () => {
    expect(enduranceSportCategory('Run')).toBe('run');
    expect(enduranceSportCategory('TrailRun')).toBe('run');
  });

  it('classifica pedal e variações (indoor, mtb, gravel) como "ride"', () => {
    expect(enduranceSportCategory('Ride')).toBe('ride');
    expect(enduranceSportCategory('VirtualRide')).toBe('ride');
    expect(enduranceSportCategory('MountainBikeRide')).toBe('ride');
    expect(enduranceSportCategory('GravelRide')).toBe('ride');
  });

  it('classifica natação como "swim"', () => {
    expect(enduranceSportCategory('Swim')).toBe('swim');
  });

  it('cai pra "other" em tipos não mapeados (ex.: musculação)', () => {
    expect(enduranceSportCategory('WeightTraining')).toBe('other');
  });
});

describe('formatPaceMinKm', () => {
  it('converte velocidade média (m/s) em pace min:seg/km', () => {
    // 1000m / (1000/3600 m/s) = 3600s = 1h/km -> um pace bem lento de propósito
    // pra checar a matemática com um número redondo: 2.7778 m/s = 6:00/km
    expect(formatPaceMinKm(2.7778)).toBe('6:00 /km');
  });

  it('arredonda segundos que viram 60 pro minuto seguinte', () => {
    // ~5:59.6/km arredondaria pra 6:00, não "5:60"
    const speed = 1000 / (5 * 60 + 59.6);
    expect(formatPaceMinKm(speed)).toBe('6:00 /km');
  });

  it('retorna travessão quando não há velocidade', () => {
    expect(formatPaceMinKm(null)).toBe('—');
    expect(formatPaceMinKm(0)).toBe('—');
  });
});

describe('formatPaceMin100m', () => {
  it('converte velocidade média (m/s) em pace min:seg/100m', () => {
    // 100m / (100/90 m/s) = 90s = 1:30/100m
    expect(formatPaceMin100m(100 / 90)).toBe('1:30 /100m');
  });

  it('retorna travessão quando não há velocidade', () => {
    expect(formatPaceMin100m(null)).toBe('—');
  });
});

describe('formatSpeedKmh', () => {
  it('converte m/s pra km/h', () => {
    expect(formatSpeedKmh(10)).toBe('36.0 km/h');
  });

  it('retorna travessão quando ausente', () => {
    expect(formatSpeedKmh(null)).toBe('—');
  });
});

describe('formatPower', () => {
  it('prioriza a potência normalizada (weighted) sobre a média simples e marca "(NP)"', () => {
    expect(formatPower(180, 201)).toBe('201 W (NP)');
  });

  it('cai pra média simples sem "(NP)" quando não há normalizada', () => {
    expect(formatPower(180, null)).toBe('180 W');
  });

  it('retorna travessão quando não há nenhuma das duas (ex.: corrida sem medidor)', () => {
    expect(formatPower(null, null)).toBe('—');
  });
});

describe('formatCadence', () => {
  it('dobra a cadência de corrida (Strava manda de uma perna só) e usa "spm"', () => {
    expect(formatCadence(85, 'run')).toBe('170 spm');
  });

  it('mantém a cadência de pedal como veio e usa "rpm"', () => {
    expect(formatCadence(84, 'ride')).toBe('84 rpm');
  });

  it('retorna travessão quando ausente', () => {
    expect(formatCadence(null, 'run')).toBe('—');
  });
});

describe('formatElevationGain', () => {
  it('formata com sinal de "+" e arredonda', () => {
    expect(formatElevationGain(320.4)).toBe('+320 m');
  });

  it('retorna travessão quando ausente ou zero', () => {
    expect(formatElevationGain(null)).toBe('—');
    expect(formatElevationGain(0)).toBe('—');
  });
});
