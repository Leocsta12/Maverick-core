import { Meal, WaterLog, computeDailyTotals } from '../nutrition';

function meal(partial: Partial<Meal>): Meal {
  return {
    id: 'm1',
    entryDate: '2024-06-10',
    mealType: 'almoco',
    name: 'Refeição',
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    loggedAt: '2024-06-10T12:00:00Z',
    ...partial,
  };
}

function water(amountMl: number): WaterLog {
  return { id: `w-${amountMl}`, entryDate: '2024-06-10', amountMl, loggedAt: '2024-06-10T12:00:00Z' };
}

describe('computeDailyTotals', () => {
  it('devolve tudo zerado sem refeições nem água', () => {
    expect(computeDailyTotals([], [])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0 });
  });

  it('soma calorias e macros de várias refeições', () => {
    const meals = [
      meal({ calories: 500, proteinG: 30, carbsG: 50, fatG: 10 }),
      meal({ calories: 300, proteinG: 20, carbsG: 30, fatG: 5 }),
    ];
    expect(computeDailyTotals(meals, [])).toEqual({ calories: 800, proteinG: 50, carbsG: 80, fatG: 15, waterMl: 0 });
  });

  it('trata macro não informado (null) como 0, sem virar NaN', () => {
    const meals = [meal({ calories: 400, proteinG: null, carbsG: 40, fatG: null })];
    const totals = computeDailyTotals(meals, []);
    expect(totals.proteinG).toBe(0);
    expect(totals.fatG).toBe(0);
    expect(totals.calories).toBe(400);
  });

  it('soma a água de múltiplas doses registradas', () => {
    const totals = computeDailyTotals([], [water(200), water(300), water(500)]);
    expect(totals.waterMl).toBe(1000);
  });
});
