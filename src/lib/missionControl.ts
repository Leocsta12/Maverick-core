import { deriveInsight } from './health';

/**
 * Maverick Mission Control — compõe o Daily Brief do Painel a partir do
 * Maverick Score (Health) + treino de hoje (Treinos) + nutrição de hoje
 * (Nutrition). Fica fora da tela por dois motivos: é lógica pura (fácil de
 * testar sem montar componente) e é o tipo de coisa que uma versão futura
 * troca por um resumo gerado por IA sem mexer na tela — só troca essa função.
 *
 * Princípio 001 do produto: nunca mostrar um dado sem explicar o que fazer
 * com ele. Por isso o brief sempre tenta terminar com UMA próxima ação
 * concreta — não uma lista de tudo que falta, pra não virar ruído.
 */

export type TrainingToday = {
  label: string;
  isRestDay: boolean;
  totalExercises: number;
  isDone: boolean;
} | null;

export type NutritionToday = {
  waterMl: number;
  waterGoalMl: number;
  calories: number;
  calorieGoal: number | null;
  mealsLogged: number;
} | null;

export function composeDailyBrief(score: number | null, training: TrainingToday, nutrition: NutritionToday): string {
  const base = deriveInsight(score);
  if (score == null) return base;

  let nextAction: string | null = null;

  if (training && !training.isRestDay && !training.isDone && training.totalExercises > 0) {
    const n = training.totalExercises;
    nextAction = `Seu treino de hoje (${training.label}) ainda não foi feito — ${n} exercício${n === 1 ? '' : 's'} te esperando.`;
  } else if (nutrition && nutrition.waterMl === 0) {
    nextAction = 'Você ainda não registrou água hoje — comece com um copo.';
  } else if (nutrition && nutrition.mealsLogged === 0) {
    nextAction = 'Nenhuma refeição registrada ainda hoje.';
  }

  return nextAction ? `${base} ${nextAction}` : base;
}
