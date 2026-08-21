// Testes de src/lib/trainingLoad.ts — zonas de FC, carga (TRIMP
// simplificado) e ACWR. Tudo lógica pura sobre arrays de atividades, sem
// tocar o Supabase — os bugs que importam aqui são de matemática/limite
// de zona, não de rede.

import {
  acuteChronicRatio,
  activityLoad,
  classifyZone,
  currentAndPreviousWeek,
  estimateMaxHeartrate,
  weekStart,
  weeklyLoadSummary,
  zoneLabel,
} from '../trainingLoad';

describe('classifyZone', () => {
  const maxHr = 190;

  it('classifica abaixo de 60% como zona 1 (recuperação)', () => {
    expect(classifyZone(100, maxHr)).toBe(1); // ~52.6%
  });

  it('classifica 60-70% como zona 2', () => {
    expect(classifyZone(120, maxHr)).toBe(2); // ~63.2%
  });

  it('classifica 70-80% como zona 3', () => {
    expect(classifyZone(140, maxHr)).toBe(3); // ~73.7%
  });

  it('classifica 80-90% como zona 4', () => {
    expect(classifyZone(160, maxHr)).toBe(4); // ~84.2%
  });

  it('classifica 90%+ como zona 5', () => {
    expect(classifyZone(180, maxHr)).toBe(5); // ~94.7%
  });

  it('nos limites exatos (60/70/80/90%), conta pra zona de cima', () => {
    expect(classifyZone(0.6 * maxHr, maxHr)).toBe(2);
    expect(classifyZone(0.7 * maxHr, maxHr)).toBe(3);
    expect(classifyZone(0.8 * maxHr, maxHr)).toBe(4);
    expect(classifyZone(0.9 * maxHr, maxHr)).toBe(5);
  });

  it('nunca quebra com FC máxima zero ou negativa — cai pra zona 1', () => {
    expect(classifyZone(150, 0)).toBe(1);
    expect(classifyZone(150, -10)).toBe(1);
  });
});

describe('zoneLabel', () => {
  it('tem um rótulo em português pras 5 zonas', () => {
    expect(zoneLabel(1)).toBe('Recuperação');
    expect(zoneLabel(5)).toBe('Máximo');
  });
});

describe('estimateMaxHeartrate', () => {
  it('usa o maior max_heartrate já observado no histórico', () => {
    const activities = [{ maxHeartrate: 180 }, { maxHeartrate: 195 }, { maxHeartrate: 170 }];
    expect(estimateMaxHeartrate(activities)).toBe(195);
  });

  it('ignora atividades sem max_heartrate', () => {
    const activities = [{ maxHeartrate: null }, { maxHeartrate: 185 }];
    expect(estimateMaxHeartrate(activities)).toBe(185);
  });

  it('retorna null quando nenhuma atividade tem o dado (ex.: sincronizadas antes dessa coluna existir)', () => {
    expect(estimateMaxHeartrate([{ maxHeartrate: null }])).toBeNull();
    expect(estimateMaxHeartrate([])).toBeNull();
  });
});

describe('activityLoad', () => {
  it('multiplica minutos pelo peso da zona', () => {
    expect(activityLoad(1800, 2)).toBe(60); // 30 min * peso 2
    expect(activityLoad(3600, 5)).toBe(300); // 60 min * peso 5
  });
});

describe('weekStart', () => {
  it('retorna a própria segunda-feira quando a data já é segunda', () => {
    const monday = new Date('2026-08-17T15:00:00Z'); // uma segunda-feira
    expect(weekStart(monday).toISOString().slice(0, 10)).toBe('2026-08-17');
  });

  it('retorna a segunda anterior quando a data é domingo', () => {
    const sunday = new Date('2026-08-23T10:00:00Z');
    expect(weekStart(sunday).toISOString().slice(0, 10)).toBe('2026-08-17');
  });

  it('retorna a segunda anterior quando a data é quinta', () => {
    const thursday = new Date('2026-08-20T10:00:00Z');
    expect(weekStart(thursday).toISOString().slice(0, 10)).toBe('2026-08-17');
  });
});

describe('weeklyLoadSummary', () => {
  const maxHr = 190;

  it('soma a carga de atividades da mesma semana, separada por esporte', () => {
    const activities = [
      { movingTimeSeconds: 1800, averageHeartrate: 120, startedAt: '2026-08-17T08:00:00Z', sportType: 'Run' }, // seg, zona 2, 60
      { movingTimeSeconds: 3600, averageHeartrate: 140, startedAt: '2026-08-19T08:00:00Z', sportType: 'Ride' }, // qua, zona 3, 180
    ];
    const summary = weeklyLoadSummary(activities, maxHr);
    expect(summary).toHaveLength(1);
    expect(summary[0].weekStartIso).toBe('2026-08-17');
    expect(summary[0].totalLoad).toBe(240);
    expect(summary[0].loadBySport.Run).toBe(60);
    expect(summary[0].loadBySport.Ride).toBe(180);
  });

  it('separa em semanas diferentes quando a data cai em semanas diferentes', () => {
    const activities = [
      { movingTimeSeconds: 1800, averageHeartrate: 120, startedAt: '2026-08-17T08:00:00Z', sportType: 'Run' },
      { movingTimeSeconds: 1800, averageHeartrate: 120, startedAt: '2026-08-24T08:00:00Z', sportType: 'Run' },
    ];
    const summary = weeklyLoadSummary(activities, maxHr);
    expect(summary).toHaveLength(2);
  });

  it('ignora atividades sem FC média ou sem tempo (não dá pra estimar carga)', () => {
    const activities = [
      { movingTimeSeconds: null, averageHeartrate: 120, startedAt: '2026-08-17T08:00:00Z', sportType: 'Run' },
      { movingTimeSeconds: 1800, averageHeartrate: null, startedAt: '2026-08-17T08:00:00Z', sportType: 'Run' },
    ];
    expect(weeklyLoadSummary(activities, maxHr)).toHaveLength(0);
  });

  it('vem ordenado por semana, mais antiga primeiro', () => {
    const activities = [
      { movingTimeSeconds: 1800, averageHeartrate: 120, startedAt: '2026-08-24T08:00:00Z', sportType: 'Run' },
      { movingTimeSeconds: 1800, averageHeartrate: 120, startedAt: '2026-08-17T08:00:00Z', sportType: 'Run' },
    ];
    const summary = weeklyLoadSummary(activities, maxHr);
    expect(summary.map((w) => w.weekStartIso)).toEqual(['2026-08-17', '2026-08-24']);
  });
});

describe('currentAndPreviousWeek', () => {
  const maxHr = 190;
  // Uma sexta-feira, pra semana atual (seg-dom) já ter alguns dias
  // decorridos mas não estar completa ainda.
  const friday = new Date('2026-08-21T15:00:00Z');

  it('acha a semana atual mesmo sem ela ser o último item da lista (bug real: pegar weeks[length-1] às cegas)', () => {
    // Só tem dado de duas semanas passadas — nada ainda nesta semana
    // (é sexta e o atleta não treinou ainda). "Esta semana" tem que vir
    // null, não silenciosamente virar a última semana com dado.
    const activities = [
      { movingTimeSeconds: 1800, averageHeartrate: 120, startedAt: '2026-08-03T08:00:00Z', sportType: 'Run' }, // duas semanas atrás
      { movingTimeSeconds: 1800, averageHeartrate: 120, startedAt: '2026-08-10T08:00:00Z', sportType: 'Run' }, // semana passada
    ];
    const weeks = weeklyLoadSummary(activities, maxHr);
    const { thisWeek, lastWeek } = currentAndPreviousWeek(weeks, friday);
    expect(thisWeek).toBeNull();
    expect(lastWeek?.weekStartIso).toBe('2026-08-10');
  });

  it('acha a semana atual e a anterior quando ambas têm dado', () => {
    const activities = [
      { movingTimeSeconds: 1800, averageHeartrate: 120, startedAt: '2026-08-12T08:00:00Z', sportType: 'Run' }, // semana passada
      { movingTimeSeconds: 1800, averageHeartrate: 120, startedAt: '2026-08-19T08:00:00Z', sportType: 'Run' }, // esta semana
    ];
    const weeks = weeklyLoadSummary(activities, maxHr);
    const { thisWeek, lastWeek } = currentAndPreviousWeek(weeks, friday);
    expect(thisWeek?.weekStartIso).toBe('2026-08-17');
    expect(lastWeek?.weekStartIso).toBe('2026-08-10');
  });

  it('retorna as duas null quando não há dado nenhum', () => {
    const { thisWeek, lastWeek } = currentAndPreviousWeek([], friday);
    expect(thisWeek).toBeNull();
    expect(lastWeek).toBeNull();
  });
});

describe('acuteChronicRatio', () => {
  const maxHr = 190;
  const now = new Date('2026-08-21T12:00:00Z');

  it('classifica como "ideal" quando a carga aguda e crônica estão equilibradas', () => {
    // Mesma carga toda semana nas últimas 4 semanas -> ratio ~1.0
    // (evita cair exatamente em cima do limite de 7 dias pra não fazer a
    // atividade "da fronteira" contar duas vezes por causa de >=)
    const activities = [1, 8, 15, 22].map((daysAgo) => ({
      movingTimeSeconds: 1800,
      averageHeartrate: 120, // zona 2
      startedAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      sportType: 'Run',
    }));
    const result = acuteChronicRatio(activities, maxHr, now);
    expect(result.ratio).toBeCloseTo(1, 1);
    expect(result.risk).toBe('ideal');
  });

  it('classifica como "alto" risco quando a carga recente disparou muito acima da crônica', () => {
    const activities = [
      // 3 semanas "de base" bem leves
      ...[8, 15, 22].map((daysAgo) => ({
        movingTimeSeconds: 900,
        averageHeartrate: 110,
        startedAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
        sportType: 'Run',
      })),
      // semana atual com um volume bem maior
      {
        movingTimeSeconds: 7200,
        averageHeartrate: 170,
        startedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        sportType: 'Run',
      },
    ];
    const result = acuteChronicRatio(activities, maxHr, now);
    expect(result.ratio).toBeGreaterThan(1.5);
    expect(result.risk).toBe('alto');
  });

  it('classifica como "baixa" quando não treinou quase nada na semana recente comparado ao histórico', () => {
    const activities = [8, 15, 22].map((daysAgo) => ({
      movingTimeSeconds: 3600,
      averageHeartrate: 150,
      startedAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      sportType: 'Run',
    }));
    const result = acuteChronicRatio(activities, maxHr, now);
    expect(result.acuteLoad).toBe(0);
    expect(result.risk).toBe('baixa');
  });

  it('não classifica como risco (fica "ideal" por falta de dado) quando não há histórico crônico nenhum', () => {
    const result = acuteChronicRatio([], maxHr, now);
    expect(result.ratio).toBeNull();
    expect(result.risk).toBe('ideal');
  });

  it('ignora atividades fora da janela de 28 dias', () => {
    const activities = [{
      movingTimeSeconds: 3600,
      averageHeartrate: 150,
      startedAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      sportType: 'Run',
    }];
    const result = acuteChronicRatio(activities, maxHr, now);
    expect(result.chronicWeeklyAverage).toBe(0);
  });
});
