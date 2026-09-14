import { classifyZone, zoneLabel, type HeartRateZone } from './trainingLoad';
import { enduranceSportCategory } from './strava';

/**
 * Maverick Zonas de Pace — pace típico (min/km) observado historicamente
 * em cada zona de FC, só pra corrida. Diferente de uma fórmula genérica
 * de tabela (%FCmax → pace-padrão), isso usa o HISTÓRICO REAL do
 * próprio atleta: agrupa as corridas sincronizadas do Strava pela zona
 * de FC que cada uma caiu (mesma classifyZone já usada pra carga — ver
 * trainingLoad.ts) e tira o pace médio de cada grupo.
 *
 * Por que pace e não só FC: corredor de verdade treina por pace — um
 * intervalado é prescrito como "4:00/km", não "Z4". FC atrasa em
 * relação ao esforço e varia com calor, cafeína e fadiga acumulada;
 * pace é o número que sai no relógio na hora do treino. As zonas de FC
 * continuam existindo (pra carga/ACWR), isso aqui é a tradução delas
 * pro que o atleta realmente vê no pulso enquanto corre.
 */

export type PaceZoneActivity = {
  sportType: string;
  averageHeartrate: number | null;
  distanceMeters: number | null;
  movingTimeSeconds: number | null;
};

export type PaceZoneEstimate = {
  zone: HeartRateZone;
  label: string;
  /** null = corridas insuficientes nessa zona ainda pra estimar (evita mostrar um número instável com 1 amostra só). */
  averagePaceSecPerKm: number | null;
  sampleCount: number;
};

const MIN_SAMPLES_PER_ZONE = 2;

export function estimatePaceZones(activities: PaceZoneActivity[], maxHeartrate: number): PaceZoneEstimate[] {
  const paceByZone = new Map<HeartRateZone, number[]>();

  for (const a of activities) {
    if (a.averageHeartrate == null || a.distanceMeters == null || a.movingTimeSeconds == null) continue;
    if (a.distanceMeters <= 0 || a.movingTimeSeconds <= 0) continue;
    if (enduranceSportCategory(a.sportType) !== 'run') continue;

    const zone = classifyZone(a.averageHeartrate, maxHeartrate);
    const paceSecPerKm = a.movingTimeSeconds / (a.distanceMeters / 1000);
    const existing = paceByZone.get(zone) ?? [];
    existing.push(paceSecPerKm);
    paceByZone.set(zone, existing);
  }

  const zones: HeartRateZone[] = [1, 2, 3, 4, 5];
  return zones.map((zone) => {
    const paces = paceByZone.get(zone) ?? [];
    const averagePaceSecPerKm =
      paces.length >= MIN_SAMPLES_PER_ZONE ? paces.reduce((a, b) => a + b, 0) / paces.length : null;
    return { zone, label: zoneLabel(zone), averagePaceSecPerKm, sampleCount: paces.length };
  });
}

// Mesmo formato de formatPaceMinKm (strava.ts) — "M:SS /km" — pro pace de
// zona parecer visualmente o mesmo pace já mostrado por atividade na tela
// de Health. Não reaproveita a função direto porque ela recebe velocidade
// (m/s), e aqui já temos segundos/km calculado; só replica a mesma
// correção de arredondamento (60s "carrega" pro minuto seguinte).
export function formatPacePerKm(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  const ss = s === 60 ? 0 : s;
  const mm = s === 60 ? m + 1 : m;
  return `${mm}:${ss.toString().padStart(2, '0')} /km`;
}
