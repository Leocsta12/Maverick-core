import type { LoadRisk } from './trainingLoad';

/**
 * Maverick Coach — Prontidão de treino (combina recuperação + carga).
 *
 * O Maverick Score (src/lib/health.ts) já mede recuperação — sono, HRV, FC
 * de repouso, passos. O que faltava é combinar isso com o que a carga de
 * treino já registrada está dizendo: ACWR de endurance (src/lib/
 * trainingLoad.ts) e o RPE médio recente de musculação. É essencialmente
 * o conceito de "Training Stress Balance" da ciência do esporte — quanta
 * capacidade de recuperação sobra depois de descontar o estresse recente
 * — só que combinando os dois lados do treino híbrido (força + endurance)
 * numa leitura só, em vez de três números soltos que o atleta precisa
 * cruzar na cabeça sozinho.
 *
 * Cada componente ausente vira um valor NEUTRO (nem penaliza nem premia)
 * em vez de 0 — mesmo princípio já usado no Maverick Score pra não deixar
 * o número artificialmente extremo só por falta de dado.
 */

export type ReadinessInputs = {
  /** computeMaverickScore() de src/lib/health.ts — null se não há registro de hoje. */
  recoveryScore: number | null;
  /** .risk de acuteChronicRatio() de src/lib/trainingLoad.ts — null se não há atividade/FC máxima suficiente ainda. */
  acwrRisk: LoadRisk | null;
  /** Média de RPE das sessões de musculação recentes — null se nenhuma teve RPE registrado. */
  recentAvgRpe: number | null;
};

export type LimitingFactor = 'recuperacao' | 'carga_endurance' | 'carga_forca';

export type ReadinessResult = {
  score: number;
  /** Qual sinal está puxando o score pra baixo — null quando não há dado ruim o bastante pra apontar um culpado específico. */
  limitingFactor: LimitingFactor | null;
  message: string;
};

const NEUTRAL = 70;
const WEIGHTS = { recovery: 0.5, acwr: 0.25, rpe: 0.25 } as const;
// Só aponta um fator como "o motivo" se ele estiver abaixo disso — evita
// culpar o pior dos três números mesmo quando todos estão razoáveis.
const BLAME_THRESHOLD = 65;

function acwrSubScore(risk: LoadRisk | null): number {
  switch (risk) {
    case 'alto':
      return 20; // pico de carga recente — maior risco de lesão, prontidão baixa de propósito
    case 'atencao':
      return 50;
    case 'ideal':
      return 90;
    case 'baixa':
      return 80; // destreinando não é "fadiga" — é o oposto, então pontua bem (fresco, não é risco)
    default:
      return NEUTRAL;
  }
}

function rpeSubScore(avgRpe: number | null): number {
  if (avgRpe == null) return NEUTRAL;
  if (avgRpe >= 9) return 30;
  if (avgRpe >= 7.5) return 60;
  return 90;
}

const FACTOR_REASON: Record<LimitingFactor, string> = {
  recuperacao: 'seu sono/HRV/FC de repouso estão pedindo recuperação',
  carga_endurance: 'a carga de corrida/pedal/natação está alta essa semana',
  carga_forca: 'o RPE da musculação recente está alto',
};

function buildMessage(score: number, limitingFactor: LimitingFactor | null): string {
  if (score >= 75) {
    return 'Prontidão alta — dia bom pra treinar com intensidade, tanto na musculação quanto no cardio.';
  }
  if (score >= 50) {
    return limitingFactor
      ? `Prontidão moderada — treine normal, mas de olho: ${FACTOR_REASON[limitingFactor]}.`
      : 'Prontidão moderada — treine normal, sem forçar recordes hoje.';
  }
  return limitingFactor
    ? `Prontidão baixa — ${FACTOR_REASON[limitingFactor]}. Considere um treino leve ou descanso ativo hoje.`
    : 'Prontidão baixa — considere um treino leve ou descanso ativo hoje.';
}

export function computeReadiness(inputs: ReadinessInputs): ReadinessResult {
  if (inputs.recoveryScore == null && inputs.acwrRisk == null && inputs.recentAvgRpe == null) {
    return {
      score: NEUTRAL,
      limitingFactor: null,
      message: 'Registre seu sono de hoje e sincronize suas atividades pra calcularmos sua prontidão.',
    };
  }

  const recoveryComponent = inputs.recoveryScore ?? NEUTRAL;
  const acwrComponent = acwrSubScore(inputs.acwrRisk);
  const rpeComponent = rpeSubScore(inputs.recentAvgRpe);

  const score = Math.round(recoveryComponent * WEIGHTS.recovery + acwrComponent * WEIGHTS.acwr + rpeComponent * WEIGHTS.rpe);

  // Só aponta um fator como "o motivo" entre os que TÊM dado de verdade —
  // um componente neutro por falta de registro nunca deve levar a culpa.
  const candidates: { factor: LimitingFactor; value: number }[] = [
    ...(inputs.recoveryScore != null ? [{ factor: 'recuperacao' as const, value: recoveryComponent }] : []),
    ...(inputs.acwrRisk != null ? [{ factor: 'carga_endurance' as const, value: acwrComponent }] : []),
    ...(inputs.recentAvgRpe != null ? [{ factor: 'carga_forca' as const, value: rpeComponent }] : []),
  ];
  const worst = candidates.length > 0 ? candidates.reduce((min, c) => (c.value < min.value ? c : min)) : null;
  const limitingFactor = worst && worst.value < BLAME_THRESHOLD ? worst.factor : null;

  return { score, limitingFactor, message: buildMessage(score, limitingFactor) };
}
