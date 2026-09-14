import { estimatePaceZones, formatPacePerKm, type PaceZoneActivity } from '../paceZones';

const MAX_HR = 190;

function run(overrides: Partial<PaceZoneActivity> = {}): PaceZoneActivity {
  return {
    sportType: 'Run',
    averageHeartrate: 114, // 60% de 190 -> zona 2
    distanceMeters: 8000,
    movingTimeSeconds: 2400, // 300s/km = 5:00/km
    ...overrides,
  };
}

describe('formatPacePerKm', () => {
  it('formata segundos por km como m:ss /km, mesmo formato de formatPaceMinKm (strava.ts)', () => {
    expect(formatPacePerKm(300)).toBe('5:00 /km');
    expect(formatPacePerKm(330)).toBe('5:30 /km');
    expect(formatPacePerKm(65)).toBe('1:05 /km');
  });

  it('arredonda frações de segundo', () => {
    expect(formatPacePerKm(300.6)).toBe('5:01 /km');
  });

  it('carrega os segundos pro minuto seguinte quando arredonda pra 60', () => {
    expect(formatPacePerKm(299.6)).toBe('5:00 /km');
  });
});

describe('estimatePaceZones', () => {
  it('agrupa corridas pela zona de FC e tira o pace médio de cada zona', () => {
    const activities: PaceZoneActivity[] = [
      run({ averageHeartrate: 114, movingTimeSeconds: 2400, distanceMeters: 8000 }), // Z2, 5:00/km
      run({ averageHeartrate: 114, movingTimeSeconds: 2520, distanceMeters: 8000 }), // Z2, 5:15/km
      run({ averageHeartrate: 171, movingTimeSeconds: 1200, distanceMeters: 5000 }), // Z5 (90%), 4:00/km
      run({ averageHeartrate: 171, movingTimeSeconds: 1240, distanceMeters: 5000 }), // Z5, ~4:08/km
    ];
    const zones = estimatePaceZones(activities, MAX_HR);
    const z2 = zones.find((z) => z.zone === 2)!;
    const z5 = zones.find((z) => z.zone === 5)!;
    expect(z2.sampleCount).toBe(2);
    expect(z2.averagePaceSecPerKm).toBeCloseTo((300 + 315) / 2, 0);
    expect(z5.sampleCount).toBe(2);
    expect(z5.averagePaceSecPerKm).not.toBeNull();
  });

  it('sempre retorna as 5 zonas, mesmo sem corrida nenhuma', () => {
    const zones = estimatePaceZones([], MAX_HR);
    expect(zones.map((z) => z.zone)).toEqual([1, 2, 3, 4, 5]);
    expect(zones.every((z) => z.averagePaceSecPerKm === null)).toBe(true);
  });

  it('fica null (sem alarmar à toa) com só 1 amostra numa zona', () => {
    const zones = estimatePaceZones([run({ averageHeartrate: 114 })], MAX_HR);
    const z2 = zones.find((z) => z.zone === 2)!;
    expect(z2.sampleCount).toBe(1);
    expect(z2.averagePaceSecPerKm).toBeNull();
  });

  it('ignora atividades que não são corrida (bike, natação)', () => {
    const zones = estimatePaceZones(
      [run({ sportType: 'Ride' }), run({ sportType: 'Swim' }), run({ sportType: 'Run' }), run({ sportType: 'Run' })],
      MAX_HR
    );
    const z2 = zones.find((z) => z.zone === 2)!;
    expect(z2.sampleCount).toBe(2);
  });

  it('ignora atividades sem FC, distância ou tempo', () => {
    const zones = estimatePaceZones(
      [
        run({ averageHeartrate: null }),
        run({ distanceMeters: null }),
        run({ movingTimeSeconds: null }),
        run({ distanceMeters: 0 }),
      ],
      MAX_HR
    );
    expect(zones.every((z) => z.sampleCount === 0)).toBe(true);
  });
});
