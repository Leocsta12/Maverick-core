// Decide QUANDO mandar um push proativo e o que dizer nele — separado do
// handler (index.ts) pra dar pra testar sem precisar de um client do
// Supabase de verdade, mesmo espírito de stravaSync.ts.

import { acuteChronicRatio, estimateMaxHeartrate, weeklyLoadSummary, type LoadRisk } from './trainingLoad.ts';
import { detectDeloadStatus } from './periodization.ts';
import { computeTaperStatus } from './taper.ts';

export type NotificationType = 'prontidao_baixa' | 'deload_atrasado' | 'taper_prova';

export type NotificationCandidate = {
  type: NotificationType;
  title: string;
  body: string;
};

export type MinimalActivity = {
  sportType: string;
  startedAt: string;
  movingTimeSeconds: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
};

// Janela mínima entre dois avisos do MESMO tipo pro MESMO usuário — sem
// isso, uma condição que persiste por dias (ex.: carga alta a semana
// inteira) viraria um push por dia, o que é mais irritante do que útil.
// taper_prova tem cooldown de 1 dia de propósito: perto da prova a fase
// muda quase diariamente, e cada mudança de fase é informação nova.
const COOLDOWN_DAYS: Record<NotificationType, number> = {
  prontidao_baixa: 3,
  deload_atrasado: 5,
  taper_prova: 1,
};

export function shouldNotify(type: NotificationType, lastSentAtIso: string | null, now: Date = new Date()): boolean {
  if (!lastSentAtIso) return true;
  const daysSince = (now.getTime() - new Date(lastSentAtIso).getTime()) / (24 * 60 * 60 * 1000);
  return daysSince >= COOLDOWN_DAYS[type];
}

export type BuildCandidatesInput = {
  activities: MinimalActivity[];
  /** Média de RPE das sessões de musculação recentes (últimos ~14 dias) — null se nenhuma teve RPE registrado. */
  recentAvgRpe: number | null;
  /** Sono da última noite registrada em Health — null se não há registro recente. */
  latestSleepHours: number | null;
  /** yyyy-mm-dd da próxima prova cadastrada — null se não há nenhuma futura. */
  nextRaceDate: string | null;
  now?: Date;
};

/**
 * Versão SIMPLIFICADA da prontidão pra decidir só "vale mandar um push
 * de alerta?" — não é o Maverick Score completo do app (que pondera
 * sono/HRV contra uma linha de base pessoal via computeMaverickScore, em
 * src/lib/health.ts). Aqui só interessa: tem algum sinal ruim o
 * suficiente pra merecer atenção agora? O número exato quem mostra é o
 * app, isso aqui é só o gatilho do aviso.
 */
export function buildCandidates(input: BuildCandidatesInput): NotificationCandidate[] {
  const candidates: NotificationCandidate[] = [];
  const now = input.now ?? new Date();

  const maxHr = estimateMaxHeartrate(input.activities);
  const acwrRisk: LoadRisk | null = maxHr != null ? acuteChronicRatio(input.activities, maxHr, now).risk : null;

  const badSleep = input.latestSleepHours != null && input.latestSleepHours < 6;
  const highRpe = input.recentAvgRpe != null && input.recentAvgRpe >= 9;
  const highAcwr = acwrRisk === 'alto';

  if (highAcwr || highRpe || badSleep) {
    const reason = highAcwr
      ? 'a carga de treino está alta essa semana'
      : highRpe
        ? 'o esforço da sua última musculação foi muito alto'
        : 'seu sono das últimas noites está baixo';
    candidates.push({
      type: 'prontidao_baixa',
      title: 'Prontidão baixa hoje',
      body: `Sinal de fadiga: ${reason}. Considere um treino mais leve hoje.`,
    });
  }

  if (maxHr != null) {
    const weeks = weeklyLoadSummary(input.activities, maxHr);
    const deload = detectDeloadStatus(
      weeks.map((w) => ({ weekStartIso: w.weekStartIso, totalLoad: w.totalLoad })),
      acwrRisk
    );
    if (deload.recommended) {
      candidates.push({ type: 'deload_atrasado', title: 'Hora de uma semana mais leve', body: deload.message });
    }
  }

  if (input.nextRaceDate) {
    const taper = computeTaperStatus(input.nextRaceDate, now);
    // Só notifica nas fases realmente próximas — "fora do taper" e
    // "início do taper" não são alerta, são só contexto de fundo.
    if (taper.phase === 'taper_avancado' || taper.phase === 'semana_prova' || taper.phase === 'dia_prova') {
      candidates.push({
        type: 'taper_prova',
        title: taper.phase === 'dia_prova' ? 'Hoje é o dia da prova!' : 'Sua prova está chegando',
        body: taper.message,
      });
    }
  }

  return candidates;
}
