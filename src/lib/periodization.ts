import type { LoadRisk } from './trainingLoad';

/**
 * Maverick Coach — periodização e detecção de deload.
 *
 * Não é um planejador de blocos (o atleta não marca "semana de
 * acúmulo/intensificação" na mão) — é uma leitura AUTOMÁTICA de "há
 * quanto tempo não acontece uma redução de carga clara" em cima do que já
 * é calculado em outro lugar (carga semanal de endurance em
 * src/lib/trainingLoad.ts, volume semanal de séries em
 * src/lib/muscleVolume.ts). O padrão clássico de periodização linear é um
 * bloco de 3-4 semanas subindo carga seguido de uma semana de descarga —
 * é essa cadência que se verifica aqui, mais o ACWR atual como sinal de
 * segurança que pode antecipar a recomendação.
 *
 * Genérico o bastante pra rodar tanto sobre carga de endurance (TRIMP)
 * quanto sobre volume de musculação (séries/semana) — quem chama é quem
 * decide qual série de números passar.
 */

export type WeeklyLoadPoint = {
  weekStartIso: string;
  totalLoad: number;
};

export type DeloadStatus = {
  recommended: boolean;
  /** null quando o histórico é curto demais pra saber (menos de 2 semanas de dado). */
  weeksSinceLastDeload: number | null;
  message: string;
};

// Uma semana que caiu pra <=60% da carga da semana anterior conta como
// uma deload que já aconteceu (intencional ou não) — não precisa que o
// atleta tenha marcado isso explicitamente em lugar nenhum.
const DELOAD_DROP_RATIO = 0.6;

// Padrão clássico de periodização linear: 3-4 semanas de acúmulo antes de
// uma descarga. Usa o teto (4) como o ponto em que já vale recomendar.
const WEEKS_BEFORE_DELOAD_DUE = 4;

function isDeloadDrop(current: number, previous: number): boolean {
  if (previous <= 0) return false;
  return current <= previous * DELOAD_DROP_RATIO;
}

/**
 * `weeks` precisa vir ordenado da mais antiga pra mais recente (mesmo
 * formato de saída de weeklyLoadSummary/weeklyVolumeByMuscleGroup).
 * `currentAcwrRisk` é opcional — só faz sentido pra carga de endurance
 * (não há um ACWR equivalente calculado pra volume de musculação ainda);
 * passar `null` ignora esse sinal e usa só a cadência de semanas.
 */
export function detectDeloadStatus(weeks: WeeklyLoadPoint[], currentAcwrRisk: LoadRisk | null = null): DeloadStatus {
  if (weeks.length < 2) {
    return {
      recommended: false,
      weeksSinceLastDeload: null,
      message: 'Ainda não há semanas suficientes de treino registradas pra avaliar periodização.',
    };
  }

  let lastDeloadIndex = -1;
  for (let i = weeks.length - 1; i >= 1; i--) {
    if (isDeloadDrop(weeks[i].totalLoad, weeks[i - 1].totalLoad)) {
      lastDeloadIndex = i;
      break;
    }
  }

  // Sem nenhuma queda encontrada no histórico disponível, conta a partir
  // do início do que se tem (não assume uma deload "invisível" antes disso).
  const weeksSinceLastDeload = lastDeloadIndex >= 0 ? weeks.length - 1 - lastDeloadIndex : weeks.length - 1;

  if (currentAcwrRisk === 'alto') {
    return {
      recommended: true,
      weeksSinceLastDeload,
      message: 'Risco de carga alto agora — considere uma semana de deload (~40-50% menos volume) antes de continuar subindo.',
    };
  }

  if (weeksSinceLastDeload >= WEEKS_BEFORE_DELOAD_DUE) {
    return {
      recommended: true,
      weeksSinceLastDeload,
      message: `${weeksSinceLastDeload} semanas sem uma redução de carga clara — bom momento pra programar uma semana de deload.`,
    };
  }

  const weeksUntilDue = WEEKS_BEFORE_DELOAD_DUE - weeksSinceLastDeload;
  return {
    recommended: false,
    weeksSinceLastDeload,
    message: `${weeksSinceLastDeload} semana(s) sem deload — dentro do esperado. Em ${weeksUntilDue} semana(s) nesse ritmo, considere programar uma.`,
  };
}
