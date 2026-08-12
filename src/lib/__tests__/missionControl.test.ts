import { NutritionToday, TrainingToday, composeDailyBrief } from '../missionControl';

const doneTraining: TrainingToday = { label: 'Peito e Tríceps', isRestDay: false, totalExercises: 6, isDone: true };
const pendingTraining: TrainingToday = { label: 'Peito e Tríceps', isRestDay: false, totalExercises: 6, isDone: false };
const restDay: TrainingToday = { label: 'Descanso', isRestDay: true, totalExercises: 0, isDone: false };

const activeNutrition: NutritionToday = { waterMl: 800, waterGoalMl: 2000, calories: 600, calorieGoal: 2200, mealsLogged: 2 };
const noWaterNutrition: NutritionToday = { waterMl: 0, waterGoalMl: 2000, calories: 0, calorieGoal: null, mealsLogged: 0 };
const noMealsNutrition: NutritionToday = { waterMl: 500, waterGoalMl: 2000, calories: 0, calorieGoal: null, mealsLogged: 0 };

describe('composeDailyBrief', () => {
  it('sem score ainda, só devolve o convite pra registrar Health (sem mencionar treino/nutrição)', () => {
    const brief = composeDailyBrief(null, pendingTraining, activeNutrition);
    expect(brief).toMatch(/Registre seu sono/);
    expect(brief).not.toMatch(/treino de hoje/);
  });

  it('prioriza avisar sobre o treino pendente quando há um', () => {
    const brief = composeDailyBrief(80, pendingTraining, activeNutrition);
    expect(brief).toContain('Seu treino de hoje (Peito e Tríceps) ainda não foi feito');
    expect(brief).toContain('6 exercícios te esperando');
  });

  it('não cobra treino se o dia é de descanso', () => {
    const brief = composeDailyBrief(80, restDay, activeNutrition);
    expect(brief).not.toMatch(/treino de hoje/);
  });

  it('não cobra treino se ele já foi concluído', () => {
    const brief = composeDailyBrief(80, doneTraining, activeNutrition);
    expect(brief).not.toMatch(/treino de hoje/);
  });

  it('cai pra avisar sobre água quando o treino já está resolvido e a água está zerada', () => {
    const brief = composeDailyBrief(80, doneTraining, noWaterNutrition);
    expect(brief).toContain('Você ainda não registrou água hoje');
  });

  it('cai pra avisar sobre refeições quando água já foi registrada mas nenhuma refeição ainda', () => {
    const brief = composeDailyBrief(80, doneTraining, noMealsNutrition);
    expect(brief).toContain('Nenhuma refeição registrada ainda hoje');
  });

  it('não anexa nenhuma ação extra quando treino, água e refeições já estão em dia', () => {
    const brief = composeDailyBrief(80, doneTraining, activeNutrition);
    expect(brief).not.toMatch(/treino de hoje|água hoje|refeição registrada/);
  });

  it('funciona sem plano de treino nem dados de nutrição carregados ainda', () => {
    expect(() => composeDailyBrief(80, null, null)).not.toThrow();
  });
});
