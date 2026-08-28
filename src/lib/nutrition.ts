import { supabase } from './supabase';

/**
 * Maverick Nutrition — Fase 1: registro manual de refeições e água.
 *
 * Mesmo espírito do Health: o formato já é o que uma integração futura
 * (import de foto de rótulo, parceria com food database) vai escrever — só
 * troca quem grava, tela e cálculo continuam os mesmos.
 */

export type MealType = 'cafe_da_manha' | 'almoco' | 'lanche' | 'jantar' | 'outro';

export const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'cafe_da_manha', label: 'Café da manhã' },
  { value: 'almoco', label: 'Almoço' },
  { value: 'lanche', label: 'Lanche' },
  { value: 'jantar', label: 'Jantar' },
  { value: 'outro', label: 'Outro' },
];

export function mealTypeLabel(type: MealType): string {
  return MEAL_TYPES.find((m) => m.value === type)?.label ?? type;
}

export type Meal = {
  id: string;
  entryDate: string;
  mealType: MealType;
  name: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  loggedAt: string;
};

export type NewMeal = {
  entryDate: string;
  mealType: MealType;
  name: string;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
};

export type WaterLog = {
  id: string;
  entryDate: string;
  amountMl: number;
  loggedAt: string;
};

export type NutritionGoals = {
  dailyCalories: number | null;
  dailyProteinG: number | null;
  dailyCarbsG: number | null;
  dailyFatG: number | null;
  dailyWaterMl: number;
};

const DEFAULT_GOALS: NutritionGoals = {
  dailyCalories: null,
  dailyProteinG: null,
  dailyCarbsG: null,
  dailyFatG: null,
  dailyWaterMl: 2000,
};

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Refeições -----------------------------------------------------------

export async function listMeals(userId: string, entryDate: string): Promise<Meal[]> {
  const { data, error } = await supabase
    .from('nutrition_meals')
    .select('id, entry_date, meal_type, name, calories, protein_g, carbs_g, fat_g, logged_at')
    .eq('user_id', userId)
    .eq('entry_date', entryDate)
    .order('logged_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    entryDate: row.entry_date,
    mealType: row.meal_type,
    name: row.name,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    loggedAt: row.logged_at,
  }));
}

export async function addMeal(userId: string, meal: NewMeal): Promise<void> {
  const { error } = await supabase.from('nutrition_meals').insert({
    user_id: userId,
    entry_date: meal.entryDate,
    meal_type: meal.mealType,
    name: meal.name.trim(),
    calories: meal.calories ?? null,
    protein_g: meal.proteinG ?? null,
    carbs_g: meal.carbsG ?? null,
    fat_g: meal.fatG ?? null,
  });
  if (error) throw error;
}

export async function deleteMeal(mealId: string): Promise<void> {
  const { error } = await supabase.from('nutrition_meals').delete().eq('id', mealId);
  if (error) throw error;
}

// Data da última refeição registrada (qualquer dia) — usado pelo painel do
// Coach (Fase "todos os atletas") pra sinalizar quem não faz check-in há dias.
export async function getLatestMealDate(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('nutrition_meals')
    .select('entry_date')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.entry_date ?? null;
}

// Datas (com repetição — uma por refeição, não deduplicada) de toda
// refeição registrada a partir de `sinceIso` — matéria-prima da
// consistência de nutrição no Relatório Semanal (src/lib/weeklyDigest.ts,
// que deduplica e filtra pela semana certa). Só a coluna de data, sem
// trazer o resto da refeição — é tudo que esse cálculo precisa.
export async function listMealDatesSince(userId: string, sinceIso: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('nutrition_meals')
    .select('entry_date')
    .eq('user_id', userId)
    .gte('entry_date', sinceIso);
  if (error) throw error;
  return (data ?? []).map((row) => row.entry_date);
}

// --- Água ------------------------------------------------------------------

export async function listWaterLogs(userId: string, entryDate: string): Promise<WaterLog[]> {
  const { data, error } = await supabase
    .from('nutrition_water_logs')
    .select('id, entry_date, amount_ml, logged_at')
    .eq('user_id', userId)
    .eq('entry_date', entryDate)
    .order('logged_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    entryDate: row.entry_date,
    amountMl: row.amount_ml,
    loggedAt: row.logged_at,
  }));
}

export async function addWater(userId: string, entryDate: string, amountMl: number): Promise<void> {
  const { error } = await supabase.from('nutrition_water_logs').insert({
    user_id: userId,
    entry_date: entryDate,
    amount_ml: amountMl,
  });
  if (error) throw error;
}

export async function removeLastWaterLog(userId: string, entryDate: string): Promise<void> {
  const logs = await listWaterLogs(userId, entryDate);
  const last = logs[logs.length - 1];
  if (!last) return;
  const { error } = await supabase.from('nutrition_water_logs').delete().eq('id', last.id);
  if (error) throw error;
}

// --- Metas -------------------------------------------------------------

export async function getGoals(userId: string): Promise<NutritionGoals> {
  const { data, error } = await supabase
    .from('nutrition_goals')
    .select('daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, daily_water_ml')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_GOALS;
  return {
    dailyCalories: data.daily_calories,
    dailyProteinG: data.daily_protein_g,
    dailyCarbsG: data.daily_carbs_g,
    dailyFatG: data.daily_fat_g,
    dailyWaterMl: data.daily_water_ml,
  };
}

export async function upsertGoals(userId: string, goals: NutritionGoals): Promise<void> {
  const { error } = await supabase.from('nutrition_goals').upsert(
    {
      user_id: userId,
      daily_calories: goals.dailyCalories,
      daily_protein_g: goals.dailyProteinG,
      daily_carbs_g: goals.dailyCarbsG,
      daily_fat_g: goals.dailyFatG,
      daily_water_ml: goals.dailyWaterMl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}

// --- Totais do dia -------------------------------------------------------

export type DailyTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
};

export function computeDailyTotals(meals: Meal[], waterLogs: WaterLog[]): DailyTotals {
  return {
    calories: meals.reduce((sum, m) => sum + (m.calories ?? 0), 0),
    proteinG: meals.reduce((sum, m) => sum + (m.proteinG ?? 0), 0),
    carbsG: meals.reduce((sum, m) => sum + (m.carbsG ?? 0), 0),
    fatG: meals.reduce((sum, m) => sum + (m.fatG ?? 0), 0),
    waterMl: waterLogs.reduce((sum, w) => sum + w.amountMl, 0),
  };
}
