/**
 * Maverick Health — zonas de frequência cardíaca e carga de treino.
 *
 * Tudo aqui é derivado do que já sincroniza do Strava (average_heartrate/
 * max_heartrate por atividade) — nenhuma tabela nova, nenhuma chamada
 * extra à API do Strava (que exigiria o endpoint de "streams", bem mais
 * caro em rate limit). É uma aproximação deliberada: em vez de "tempo em
 * cada zona" (precisaria da FC segundo a segundo), classifica cada
 * ATIVIDADE inteira numa zona pela FC média dela — suficiente pra dar
 * sinal real de intensidade sem precisar de mais dados do Strava.
 *
 * A carga (TRIMP simplificado: minutos × peso da zona) e o ACWR (relação
 * carga aguda/crônica) seguem a lógica clássica de ciência do esporte
 * (Banister / Gabbett) — a mesma ideia por trás do "Relative Effort" do
 * próprio Strava e do "Training Stress" do TrainingPeaks, só que sem
 * precisar de potência/pace pra funcionar (FC já cobre corrida, pedal,
 * natação E musculação, que é o que faz sentido pro atleta híbrido).
 */

export type HeartRateZone = 1 | 2 | 3 | 4 | 5;

const ZONE_LABELS: Record<HeartRateZone, string> = {
  1: 'Recuperação',
  2: 'Leve',
  3: 'Moderado',
  4: 'Limiar',
  5: 'Máximo',
};

export function zoneLabel(zone: HeartRateZone): string {
  return ZONE_LABELS[zone];
}

// Peso de cada zona no cálculo de carga — quanto mais intensa, mais carga
// por minuto. Linear de propósito (1 a 5): é a mesma simplificação que o
// TRIMP "banisteriano" usa antes de aplicar a curva exponencial completa,
// só que sem precisar de FC de repouso (que o app não coleta hoje).
const ZONE_WEIGHT: Record<HeartRateZone, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

/** Classifica uma FC média como % da FC máxima do atleta em uma das 5 zonas. */
export function classifyZone(averageHeartrate: number, maxHeartrate: number): HeartRateZone {
  if (maxHeartrate <= 0) return 1;
  const pct = averageHeartrate / maxHeartrate;
  if (pct >= 0.9) return 5;
  if (pct >= 0.8) return 4;
  if (pct >= 0.7) return 3;
  if (pct >= 0.6) return 2;
  return 1;
}

/**
 * FC máxima estimada a partir do próprio histórico do atleta (maior
 * max_heartrate já registrado numa atividade) — evita depender de idade
 * (o app não coleta data de nascimento) ou de o usuário preencher um
 * campo manual antes de a feature funcionar. Fica mais precisa conforme
 * mais atividades sincronizam (é o valor real mais alto já observado).
 */
export function estimateMaxHeartrate(activities: Array<{ maxHeartrate: number | null }>): number | null {
  const values = activities.map((a) => a.maxHeartrate).filter((v): v is number => v != null && v > 0);
  if (values.length === 0) return null;
  return Math.max(...values);
}

/** Carga (TRIMP simplificado) de uma atividade: minutos × peso da zona. */
export function activityLoad(movingTimeSeconds: number, zone: HeartRateZone): number {
  return (movingTimeSeconds / 60) * ZONE_WEIGHT[zone];
}

export type LoadableActivity = {
  movingTimeSeconds: number | null;
  averageHeartrate: number | null;
  startedAt: string;
  sportType: string;
};

/** Segunda-feira 00:00 da semana que contém `date` — limite de semana de treino padrão (seg–dom). */
export function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = domingo … 6 = sábado
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

export type WeeklyLoad = {
  /** ISO date (yyyy-mm-dd) da segunda-feira daquela semana. */
  weekStartIso: string;
  totalLoad: number;
  loadBySport: Record<string, number>;
};

/**
 * Agrupa atividades por semana (segunda a domingo) e soma a carga de
 * cada uma. Atividades sem FC (average_heartrate ausente) não entram na
 * conta — não tem base pra estimar zona, e contar como "zona 1" na marra
 * inflaria carga de coisas que não deviam contar.
 */
export function weeklyLoadSummary(activities: LoadableActivity[], maxHeartrate: number): WeeklyLoad[] {
  const byWeek = new Map<string, WeeklyLoad>();

  for (const a of activities) {
    if (a.averageHeartrate == null || a.movingTimeSeconds == null) continue;
    const zone = classifyZone(a.averageHeartrate, maxHeartrate);
    const load = activityLoad(a.movingTimeSeconds, zone);
    const weekIso = weekStart(new Date(a.startedAt)).toISOString().slice(0, 10);

    const entry = byWeek.get(weekIso) ?? { weekStartIso: weekIso, totalLoad: 0, loadBySport: {} };
    entry.totalLoad += load;
    entry.loadBySport[a.sportType] = (entry.loadBySport[a.sportType] ?? 0) + load;
    byWeek.set(weekIso, entry);
  }

  return Array.from(byWeek.values()).sort((a, b) => a.weekStartIso.localeCompare(b.weekStartIso));
}

/**
 * Acha a semana atual e a anterior dentro de um `weeklyLoadSummary` PELA
 * DATA DE VERDADE — nunca pelos dois últimos itens da lista. Pegar
 * `weeks[length-1]` como "esta semana" é um bug sutil e real: se o atleta
 * ainda não treinou nada nos primeiros dias da semana, isso silenciosamente
 * mostraria a última semana COM dado como se fosse a atual (rótulo errado,
 * mesmo que o número em si exista). Aqui, se não há nada nesta semana
 * ainda, `thisWeek` vem null e a UI mostra 0 de verdade.
 */
export function currentAndPreviousWeek(
  weeks: WeeklyLoad[],
  now: Date = new Date()
): { thisWeek: WeeklyLoad | null; lastWeek: WeeklyLoad | null } {
  const thisWeekIso = weekStart(now).toISOString().slice(0, 10);
  const lastWeekIso = weekStart(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
  return {
    thisWeek: weeks.find((w) => w.weekStartIso === thisWeekIso) ?? null,
    lastWeek: weeks.find((w) => w.weekStartIso === lastWeekIso) ?? null,
  };
}

export type LoadRisk = 'baixa' | 'ideal' | 'atencao' | 'alto';

export const LOAD_RISK_LABELS: Record<LoadRisk, string> = {
  baixa: 'Carga baixa — pode estar destreinando',
  ideal: 'Carga ideal — zona segura',
  atencao: 'Atenção — carga subindo rápido',
  alto: 'Risco alto — recupere antes de forçar mais',
};

export type AcuteChronicLoad = {
  acuteLoad: number;
  chronicWeeklyAverage: number;
  ratio: number | null;
  risk: LoadRisk;
};

/**
 * ACWR (Acute:Chronic Workload Ratio) — carga dos últimos 7 dias contra a
 * média semanal dos últimos 28 dias. É a métrica clássica (Gabbett, 2016)
 * de risco de lesão por pico de carga: 0.8–1.3 é a "zona segura", acima de
 * 1.5 é onde o risco de lesão sobe de verdade porque o corpo não teve
 * tempo de se adaptar ao salto de volume/intensidade.
 */
export function acuteChronicRatio(activities: LoadableActivity[], maxHeartrate: number, now: Date = new Date()): AcuteChronicLoad {
  const acuteStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const chronicStart = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  let acuteLoad = 0;
  let chronicLoad = 0;

  for (const a of activities) {
    if (a.averageHeartrate == null || a.movingTimeSeconds == null) continue;
    const startedAt = new Date(a.startedAt);
    if (startedAt < chronicStart || startedAt > now) continue;

    const zone = classifyZone(a.averageHeartrate, maxHeartrate);
    const load = activityLoad(a.movingTimeSeconds, zone);
    chronicLoad += load;
    if (startedAt >= acuteStart) acuteLoad += load;
  }

  const chronicWeeklyAverage = chronicLoad / 4;
  const ratio = chronicWeeklyAverage > 0 ? acuteLoad / chronicWeeklyAverage : null;

  let risk: LoadRisk = 'ideal';
  if (ratio == null) risk = 'ideal'; // sem histórico suficiente pra avaliar ainda — não alarma à toa
  else if (ratio > 1.5) risk = 'alto';
  else if (ratio > 1.3) risk = 'atencao';
  else if (ratio < 0.8) risk = 'baixa';

  return { acuteLoad, chronicWeeklyAverage, ratio, risk };
}
