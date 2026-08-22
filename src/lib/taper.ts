/**
 * Maverick Coach — taper (redução de carga) antes de uma prova.
 *
 * Segue a prática padrão de taper progressivo: reduzir volume mantendo
 * parte da intensidade, em vez de parar de treinar — detreinar de vez na
 * última semana faz o atleta chegar pior, não melhor. As faixas de
 * redução (%) citadas nas mensagens são orientação geral de literatura de
 * taper (ex.: Mujika & Padilla), não uma prescrição individual.
 */

export type TaperPhase =
  | 'fora_do_taper'
  | 'inicio_taper'
  | 'taper_avancado'
  | 'semana_prova'
  | 'dia_prova'
  | 'prova_concluida';

export type TaperStatus = {
  phase: TaperPhase;
  /** Negativo quando a prova já passou. */
  daysUntilRace: number;
  message: string;
};

// yyyy-mm-dd (coluna `date`, sem hora) — mesma pegadinha de fuso já
// tratada em src/lib/muscleVolume.ts: `new Date('2026-08-17')` vira
// meia-noite UTC, que em fusos negativos volta um dia quando comparado
// com horário local. Monta a data em horário local pra não cair nisso.
function localDateFromIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function computeTaperStatus(raceDateIso: string, today: Date = new Date()): TaperStatus {
  const raceDate = localDateFromIsoDate(raceDateIso);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntilRace = Math.round((raceDate.getTime() - todayMidnight.getTime()) / (24 * 60 * 60 * 1000));

  if (daysUntilRace < 0) {
    return {
      phase: 'prova_concluida',
      daysUntilRace,
      message: 'Prova já realizada — hora de descansar alguns dias e planejar o próximo ciclo.',
    };
  }
  if (daysUntilRace === 0) {
    return {
      phase: 'dia_prova',
      daysUntilRace,
      message: 'Hoje é o dia! Aquecimento leve, hidratação e carboidrato em dia — confie no treino feito.',
    };
  }
  if (daysUntilRace <= 2) {
    return {
      phase: 'semana_prova',
      daysUntilRace,
      message: `Faltam ${daysUntilRace} dia(s) — só ativações curtas e leves. Sem treino novo, sem testar equipamento/nutrição diferente.`,
    };
  }
  if (daysUntilRace <= 7) {
    return {
      phase: 'taper_avancado',
      daysUntilRace,
      message: `Faltam ${daysUntilRace} dias — reduza o volume em 40-60%, mantendo alguns estímulos curtos de intensidade.`,
    };
  }
  if (daysUntilRace <= 14) {
    return {
      phase: 'inicio_taper',
      daysUntilRace,
      message: `Faltam ${daysUntilRace} dias — comece a reduzir o volume em ~20-30%, mantendo a intensidade normal.`,
    };
  }
  return {
    phase: 'fora_do_taper',
    daysUntilRace,
    message: `Faltam ${daysUntilRace} dias — ainda é fase normal de construção de treino.`,
  };
}
