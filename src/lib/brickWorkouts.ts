/**
 * Maverick Coach — detecção de treino brick (bike+corrida, natação+bike,
 * ou o tri completo nado+bike+corrida).
 *
 * Não é um registro manual — "brick" já aparece nos dados: duas ou mais
 * atividades de esportes DIFERENTES, sincronizadas do Strava, uma logo
 * depois da outra (dentro da janela normal de transição T1/T2 de um
 * treino combinado). Detecta isso automaticamente em cima do que já
 * sincroniza, sem pedir nada novo do atleta.
 */

export type BrickActivity = {
  sportType: string;
  /** ISO com hora (started_at do Strava) — não confundir com log_date "só dia" de workout_logs. */
  startedAt: string;
  movingTimeSeconds: number | null;
};

export type BrickSession = {
  activities: BrickActivity[];
  /** Esportes na ordem em que aconteceram, ex.: ['Ride', 'Run']. */
  sports: string[];
  totalMinutes: number;
  startedAt: string;
};

// Até 1h entre o FIM de uma atividade e o INÍCIO da próxima ainda conta
// como brick — é a janela realista de troca de roupa/equipamento (T1/T2),
// não uma pausa de "treinei de manhã e de novo à noite".
const MAX_TRANSITION_MINUTES = 60;

function endTime(activity: BrickActivity): number {
  return new Date(activity.startedAt).getTime() + (activity.movingTimeSeconds ?? 0) * 1000;
}

function buildSession(activities: BrickActivity[]): BrickSession {
  return {
    activities,
    sports: activities.map((a) => a.sportType),
    totalMinutes: Math.round(activities.reduce((sum, a) => sum + (a.movingTimeSeconds ?? 0), 0) / 60),
    startedAt: activities[0].startedAt,
  };
}

/**
 * Agrupa atividades consecutivas de esportes DIFERENTES dentro da janela
 * de transição em sessões de brick. Uma sessão só conta se tiver 2+
 * atividades — uma atividade isolada nunca é um brick.
 */
export function detectBrickSessions(activities: BrickActivity[]): BrickSession[] {
  const sorted = [...activities]
    .filter((a) => a.movingTimeSeconds != null)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const sessions: BrickSession[] = [];
  let current: BrickActivity[] = [];

  const flush = () => {
    if (current.length >= 2) sessions.push(buildSession(current));
    current = [];
  };

  for (const activity of sorted) {
    if (current.length === 0) {
      current = [activity];
      continue;
    }

    const prev = current[current.length - 1];
    const gapMinutes = (new Date(activity.startedAt).getTime() - endTime(prev)) / 60000;
    const withinWindow = gapMinutes >= 0 && gapMinutes <= MAX_TRANSITION_MINUTES;
    const differentSport = activity.sportType !== prev.sportType;

    if (withinWindow && differentSport) {
      current.push(activity);
    } else {
      flush();
      current = [activity];
    }
  }
  flush();

  return sessions;
}
