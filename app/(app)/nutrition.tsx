import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radius } from '../../src/theme/tokens';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { showAlert } from '../../src/lib/alert';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { loadWithCache } from '../../src/lib/offlineCache';
import { addMealOffline, addWaterOffline, flushOfflineQueue, queuedWriteCount } from '../../src/lib/offlineSync';
import {
  DailyTotals,
  MEAL_TYPES,
  Meal,
  MealType,
  NewMeal,
  NutritionGoals,
  WaterLog,
  computeDailyTotals,
  deleteMeal,
  getGoals,
  listMeals,
  listWaterLogs,
  mealTypeLabel,
  removeLastWaterLog,
  todayIsoDate,
  upsertGoals,
} from '../../src/lib/nutrition';

const WATER_QUICK_ADD = [200, 300, 500];

function progressRatio(value: number, goal: number | null): number {
  if (!goal || goal <= 0) return 0;
  return Math.max(0, Math.min(1, value / goal));
}

export default function Nutrition() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [meals, setMeals] = useState<Meal[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [goals, setGoals] = useState<NutritionGoals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingWater, setIsAddingWater] = useState(false);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);

  const today = todayIsoDate();

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await loadWithCache(`nutrition:${user.id}:${today}`, async () => {
        const [m, w, g] = await Promise.all([listMeals(user.id, today), listWaterLogs(user.id, today), getGoals(user.id)]);
        return { meals: m, waterLogs: w, goals: g };
      });
      setMeals(result.data.meals);
      setWaterLogs(result.data.waterLogs);
      setGoals(result.data.goals);
      setOfflineSince(result.isFromCache ? result.cachedAt : null);

      // Veio da rede de verdade — sinal de que temos conexão, então
      // aproveita pra despachar qualquer refeição/água que ficou pendente.
      if (!result.isFromCache) {
        const { synced } = await flushOfflineQueue();
        if (synced > 0) {
          const [m, w] = await Promise.all([listMeals(user.id, today), listWaterLogs(user.id, today)]);
          setMeals(m);
          setWaterLogs(w);
        }
      }
      setPendingWrites(await queuedWriteCount());
    } catch {
      showAlert('Não foi possível carregar sua nutrição de hoje.');
    } finally {
      setIsLoading(false);
    }
  }, [user, today]);

  useEffect(() => {
    load();
  }, [load]);

  const totals: DailyTotals = useMemo(() => computeDailyTotals(meals, waterLogs), [meals, waterLogs]);

  const handleAddWater = async (amountMl: number) => {
    if (!user) return;
    setIsAddingWater(true);
    try {
      const result = await addWaterOffline(user.id, today, amountMl);
      if (result.queued) {
        setWaterLogs((prev) => [
          ...prev,
          { id: `pending-${Date.now()}`, entryDate: today, amountMl, loggedAt: new Date().toISOString() },
        ]);
        setPendingWrites(await queuedWriteCount());
        showAlert('Sem conexão agora — salvo no aparelho. Sincroniza sozinho assim que a internet voltar.');
      } else {
        setWaterLogs(await listWaterLogs(user.id, today));
      }
    } catch {
      showAlert('Não foi possível registrar a água.');
    } finally {
      setIsAddingWater(false);
    }
  };

  const handleAddMeal = async (meal: NewMeal): Promise<{ queued: boolean }> => {
    if (!user) return { queued: false };
    const result = await addMealOffline(user.id, meal);
    if (result.queued) {
      setMeals((prev) => [
        ...prev,
        {
          id: `pending-${Date.now()}`,
          entryDate: meal.entryDate,
          mealType: meal.mealType,
          name: meal.name,
          calories: meal.calories ?? null,
          proteinG: meal.proteinG ?? null,
          carbsG: meal.carbsG ?? null,
          fatG: meal.fatG ?? null,
          loggedAt: new Date().toISOString(),
        },
      ]);
      setPendingWrites(await queuedWriteCount());
    } else {
      setMeals(await listMeals(user.id, today));
    }
    return result;
  };

  const handleUndoWater = async () => {
    if (!user) return;
    try {
      await removeLastWaterLog(user.id, today);
      setWaterLogs(await listWaterLogs(user.id, today));
    } catch {
      showAlert('Não foi possível desfazer.');
    }
  };

  const handleDeleteMeal = (meal: Meal) => {
    showAlert('Remover refeição?', `Remove "${meal.name}" do registro de hoje.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await deleteMeal(meal.id);
          if (user) setMeals(await listMeals(user.id, today));
        },
      },
    ]);
  };

  if (!user) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
    >
      <Text style={styles.eyebrow}>NUTRITION</Text>
      <Text style={styles.title}>Sua nutrição de hoje</Text>

      <OfflineBanner cachedAt={offlineSince} />
      {pendingWrites > 0 && (
        <Text style={styles.pendingNote}>
          {pendingWrites} registro{pendingWrites === 1 ? '' : 's'} aguardando conexão pra sincronizar.
        </Text>
      )}

      <WaterCard total={totals.waterMl} goalMl={goals?.dailyWaterMl ?? 2000} isBusy={isAddingWater} onAdd={handleAddWater} onUndo={handleUndoWater} hasLogs={waterLogs.length > 0} />

      <MacrosCard totals={totals} goals={goals} />

      <Text style={styles.sectionTitle}>Refeições de hoje</Text>
      {isLoading ? (
        <Text style={styles.emptyText}>Carregando…</Text>
      ) : meals.length === 0 ? (
        <Text style={styles.emptyText}>Nenhuma refeição registrada ainda hoje.</Text>
      ) : (
        meals.map((meal) => (
          <Pressable key={meal.id} onLongPress={() => handleDeleteMeal(meal)} style={styles.mealRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mealType}>{mealTypeLabel(meal.mealType)}</Text>
              <Text style={styles.mealName}>{meal.name}</Text>
            </View>
            <Text style={styles.mealMacros}>
              {meal.calories != null ? `${meal.calories} kcal` : '—'}
              {meal.proteinG != null ? ` · P ${meal.proteinG}g` : ''}
              {meal.carbsG != null ? ` · C ${meal.carbsG}g` : ''}
              {meal.fatG != null ? ` · G ${meal.fatG}g` : ''}
            </Text>
          </Pressable>
        ))
      )}

      <AddMealForm onAdd={handleAddMeal} />

      {goals ? (
        <GoalsEditor
          goals={goals}
          onSaved={async (next) => {
            if (!user) return;
            await upsertGoals(user.id, next);
            setGoals(next);
          }}
        />
      ) : null}

      <Text style={styles.footnote}>
        Toque e segure numa refeição pra removê-la. As metas diárias são opcionais — sem elas, o app só
        acompanha o total do dia, sem comparar com uma meta.
      </Text>
    </ScrollView>
  );
}

function WaterCard({
  total,
  goalMl,
  isBusy,
  hasLogs,
  onAdd,
  onUndo,
}: {
  total: number;
  goalMl: number;
  isBusy: boolean;
  hasLogs: boolean;
  onAdd: (amountMl: number) => void;
  onUndo: () => void;
}) {
  const ratio = progressRatio(total, goalMl);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Feather name="droplet" size={16} color={colors.ignition} />
        <Text style={styles.cardTitle}>Água</Text>
      </View>
      <Text style={styles.waterValue}>
        {total} <Text style={styles.waterGoal}>/ {goalMl} ml</Text>
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
      </View>
      <View style={styles.quickAddRow}>
        {WATER_QUICK_ADD.map((ml) => (
          <Pressable key={ml} onPress={() => onAdd(ml)} disabled={isBusy} style={styles.quickAddButton}>
            <Text style={styles.quickAddText}>+{ml}ml</Text>
          </Pressable>
        ))}
        {hasLogs ? (
          <Pressable onPress={onUndo} style={styles.undoButton}>
            <Feather name="rotate-ccw" size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function MacrosCard({ totals, goals }: { totals: DailyTotals; goals: NutritionGoals | null }) {
  const rows: { label: string; value: number; goal: number | null; unit: string }[] = [
    { label: 'Calorias', value: totals.calories, goal: goals?.dailyCalories ?? null, unit: 'kcal' },
    { label: 'Proteína', value: totals.proteinG, goal: goals?.dailyProteinG ?? null, unit: 'g' },
    { label: 'Carboidrato', value: totals.carbsG, goal: goals?.dailyCarbsG ?? null, unit: 'g' },
    { label: 'Gordura', value: totals.fatG, goal: goals?.dailyFatG ?? null, unit: 'g' },
  ];
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Feather name="pie-chart" size={16} color={colors.ignition} />
        <Text style={styles.cardTitle}>Macros</Text>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={styles.macroRow}>
          <Text style={styles.macroLabel}>{row.label}</Text>
          <Text style={styles.macroValue}>
            {Math.round(row.value)}
            {row.goal ? ` / ${row.goal}` : ''} {row.unit}
          </Text>
        </View>
      ))}
    </View>
  );
}

function AddMealForm({ onAdd }: { onAdd: (meal: NewMeal) => Promise<{ queued: boolean }> }) {
  const [mealType, setMealType] = useState<MealType>('cafe_da_manha');
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const result = await onAdd({
        entryDate: todayIsoDate(),
        mealType,
        name,
        calories: calories ? Number(calories) : null,
        proteinG: protein ? Number(protein.replace(',', '.')) : null,
        carbsG: carbs ? Number(carbs.replace(',', '.')) : null,
        fatG: fat ? Number(fat.replace(',', '.')) : null,
      });
      setName('');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      if (result.queued) {
        showAlert('Sem conexão agora — salvo no aparelho. Sincroniza sozinho assim que a internet voltar.');
      }
    } catch {
      showAlert('Não foi possível registrar a refeição.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.addForm}>
      <Text style={styles.sectionTitle}>Registrar refeição</Text>
      <View style={styles.mealTypeRow}>
        {MEAL_TYPES.map((mt) => (
          <Pressable
            key={mt.value}
            onPress={() => setMealType(mt.value)}
            style={[styles.mealTypePill, mealType === mt.value && styles.mealTypePillSelected]}
          >
            <Text style={[styles.mealTypePillText, mealType === mt.value && styles.mealTypePillTextSelected]}>{mt.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextField label="O que você comeu" value={name} onChangeText={setName} placeholder="Ex: Arroz, feijão e frango grelhado" />
      <View style={styles.macroInputRow}>
        <TextField label="Kcal" value={calories} onChangeText={setCalories} keyboardType="number-pad" style={styles.macroInput} />
        <TextField label="Prot. (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" style={styles.macroInput} />
        <TextField label="Carb. (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" style={styles.macroInput} />
        <TextField label="Gord. (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" style={styles.macroInput} />
      </View>
      <Button label="Adicionar refeição" onPress={handleAdd} loading={isSaving} disabled={!name.trim()} />
    </View>
  );
}

function GoalsEditor({ goals, onSaved }: { goals: NutritionGoals; onSaved: (next: NutritionGoals) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [calories, setCalories] = useState(goals.dailyCalories?.toString() ?? '');
  const [protein, setProtein] = useState(goals.dailyProteinG?.toString() ?? '');
  const [carbs, setCarbs] = useState(goals.dailyCarbsG?.toString() ?? '');
  const [fat, setFat] = useState(goals.dailyFatG?.toString() ?? '');
  const [water, setWater] = useState(goals.dailyWaterMl.toString());
  const [isSaving, setIsSaving] = useState(false);

  if (!expanded) {
    return (
      <Pressable onPress={() => setExpanded(true)} style={styles.goalsCollapsed}>
        <Feather name="target" size={16} color={colors.steel} />
        <Text style={styles.goalsCollapsedText}>Editar metas diárias</Text>
        <Feather name="chevron-right" size={16} color={colors.steel} />
      </Pressable>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaved({
        dailyCalories: calories ? Number(calories) : null,
        dailyProteinG: protein ? Number(protein) : null,
        dailyCarbsG: carbs ? Number(carbs) : null,
        dailyFatG: fat ? Number(fat) : null,
        dailyWaterMl: Number(water) || 2000,
      });
      setExpanded(false);
    } catch {
      showAlert('Não foi possível salvar as metas.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.addForm}>
      <Text style={styles.sectionTitle}>Metas diárias</Text>
      <View style={styles.macroInputRow}>
        <TextField label="Kcal" value={calories} onChangeText={setCalories} keyboardType="number-pad" style={styles.macroInput} />
        <TextField label="Prot. (g)" value={protein} onChangeText={setProtein} keyboardType="number-pad" style={styles.macroInput} />
        <TextField label="Carb. (g)" value={carbs} onChangeText={setCarbs} keyboardType="number-pad" style={styles.macroInput} />
        <TextField label="Gord. (g)" value={fat} onChangeText={setFat} keyboardType="number-pad" style={styles.macroInput} />
      </View>
      <TextField label="Água (ml)" value={water} onChangeText={setWater} keyboardType="number-pad" placeholder="2000" />
      <Button label="Salvar metas" onPress={handleSave} loading={isSaving} style={{ marginTop: spacing.xs }} />
      <Button label="Cancelar" variant="ghost" onPress={() => setExpanded(false)} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.lg },
  sectionTitle: {
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted },
  pendingNote: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.warning,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  cardTitle: { fontFamily: typography.bodySemiBold, fontSize: 14, color: colors.textPrimary, marginLeft: 6 },
  waterValue: { fontFamily: typography.display, fontSize: 28, color: colors.textPrimary },
  waterGoal: { fontFamily: typography.body, fontSize: 14, color: colors.textMuted },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.ignition, borderRadius: radius.full },
  quickAddRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' },
  quickAddButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  quickAddText: { fontFamily: typography.bodyMedium, fontSize: 12, color: colors.textPrimary },
  undoButton: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  macroLabel: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted },
  macroValue: { fontFamily: typography.mono, fontSize: 12, color: colors.textPrimary },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  mealType: { fontFamily: typography.mono, fontSize: 10, color: colors.ignition, letterSpacing: 1, marginBottom: 2 },
  mealName: { fontFamily: typography.bodyMedium, fontSize: 14, color: colors.textPrimary },
  mealMacros: { fontFamily: typography.mono, fontSize: 11, color: colors.steel, textAlign: 'right' },
  addForm: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  mealTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  mealTypePill: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  mealTypePillSelected: { borderColor: colors.ignition, backgroundColor: colors.ignitionMuted },
  mealTypePillText: { fontFamily: typography.bodyMedium, fontSize: 12, color: colors.textMuted },
  mealTypePillTextSelected: { color: colors.ignition },
  macroInputRow: { flexDirection: 'row', gap: spacing.xs },
  macroInput: { flex: 1 },
  goalsCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  goalsCollapsedText: { flex: 1, fontFamily: typography.bodyMedium, fontSize: 13, color: colors.textMuted },
  footnote: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.steel,
    lineHeight: 16,
    marginTop: spacing.xl,
  },
});
