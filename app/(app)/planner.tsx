import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radius } from '../../src/theme/tokens';
import { Button } from '../../src/components/Button';
import { showAlert } from '../../src/lib/alert';
import { HealthEntry, computeMaverickScore, listHealthEntries } from '../../src/lib/health';
import {
  DailyTotals,
  WaterLog,
  Meal,
  NutritionGoals,
  addWater,
  computeDailyTotals,
  getGoals,
  listMeals,
  listWaterLogs,
} from '../../src/lib/nutrition';
import {
  WorkoutLog,
  WorkoutPlanDay,
  WorkoutPlanExercise,
  dayOfWeekName,
  getOrCreatePlan,
  listDayExercises,
  listPlanDays,
  listRecentLogs,
  markDayDone,
  markDayUndone,
  todayDayOfWeek,
} from '../../src/lib/workouts';

const WATER_QUICK_ADD = [200, 300, 500];

function dateForDayOfWeek(dayOfWeek: number): string {
  const now = new Date();
  const diff = dayOfWeek - now.getDay();
  const target = new Date(now);
  target.setDate(now.getDate() + diff);
  return target.toISOString().slice(0, 10);
}

function formatDatePt(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

export default function Planner() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState(todayDayOfWeek());
  const selectedDate = dateForDayOfWeek(selectedDayOfWeek);

  const [planDays, setPlanDays] = useState<WorkoutPlanDay[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [dayExercises, setDayExercises] = useState<WorkoutPlanExercise[]>([]);
  const [healthEntries, setHealthEntries] = useState<HealthEntry[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [goals, setGoals] = useState<NutritionGoals | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDay, setIsLoadingDay] = useState(false);
  const [isTogglingDone, setIsTogglingDone] = useState(false);
  const [isAddingWater, setIsAddingWater] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const plan = await getOrCreatePlan(user.id, user.id);
      const [days, logs, entries] = await Promise.all([
        listPlanDays(plan.id),
        listRecentLogs(user.id, 14),
        listHealthEntries(user.id, 30),
      ]);
      setPlanDays(days);
      setWorkoutLogs(logs);
      setHealthEntries(entries);
    } catch {
      showAlert('Não foi possível carregar seu planner.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDay = useCallback(async () => {
    if (!user) return;
    setIsLoadingDay(true);
    try {
      const day = planDays.find((d) => d.dayOfWeek === selectedDayOfWeek);
      const [exercises, dayMeals, dayWater, dayGoals] = await Promise.all([
        day && !day.isRestDay ? listDayExercises(day.id) : Promise.resolve([]),
        listMeals(user.id, selectedDate),
        listWaterLogs(user.id, selectedDate),
        getGoals(user.id),
      ]);
      setDayExercises(exercises);
      setMeals(dayMeals);
      setWaterLogs(dayWater);
      setGoals(dayGoals);
    } catch {
      showAlert('Não foi possível carregar esse dia.');
    } finally {
      setIsLoadingDay(false);
    }
  }, [user, planDays, selectedDayOfWeek, selectedDate]);

  useEffect(() => {
    if (!isLoading) loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, selectedDayOfWeek]);

  const selectedDay = planDays.find((d) => d.dayOfWeek === selectedDayOfWeek) ?? null;
  const selectedLog = selectedDay ? workoutLogs.find((l) => l.planDayId === selectedDay.id && l.logDate === selectedDate) : undefined;
  const healthEntry = healthEntries.find((e) => e.entryDate === selectedDate) ?? null;
  const scoreAsOfDay = useMemo(
    () => computeMaverickScore(healthEntries.filter((e) => e.entryDate <= selectedDate)),
    [healthEntries, selectedDate]
  );
  const totals: DailyTotals = useMemo(() => computeDailyTotals(meals, waterLogs), [meals, waterLogs]);

  const handleToggleDone = async () => {
    if (!user || !selectedDay) return;
    setIsTogglingDone(true);
    try {
      if (selectedLog) {
        await markDayUndone(selectedDay.id, selectedDate);
      } else {
        await markDayDone(user.id, selectedDay.id, selectedDate);
      }
      setWorkoutLogs(await listRecentLogs(user.id, 14));
    } catch {
      showAlert('Não foi possível salvar agora — confira sua conexão.');
    } finally {
      setIsTogglingDone(false);
    }
  };

  const handleAddWater = async (amountMl: number) => {
    if (!user) return;
    setIsAddingWater(true);
    try {
      await addWater(user.id, selectedDate, amountMl);
      setWaterLogs(await listWaterLogs(user.id, selectedDate));
    } catch {
      showAlert('Não foi possível registrar a água.');
    } finally {
      setIsAddingWater(false);
    }
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
      <Text style={styles.eyebrow}>PLANNER</Text>
      <Text style={styles.title}>Sua semana, tudo junto</Text>
      <Text style={styles.hint}>Treino, nutrição e recuperação do mesmo dia, lado a lado.</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekStrip}>
        {Array.from({ length: 7 }).map((_, dayOfWeek) => {
          const date = dateForDayOfWeek(dayOfWeek);
          const isSelected = dayOfWeek === selectedDayOfWeek;
          const isToday = dayOfWeek === todayDayOfWeek();
          const day = planDays.find((d) => d.dayOfWeek === dayOfWeek);
          const done = day ? workoutLogs.some((l) => l.planDayId === day.id && l.logDate === date) : false;
          return (
            <Pressable
              key={dayOfWeek}
              onPress={() => setSelectedDayOfWeek(dayOfWeek)}
              style={[styles.dayChip, isSelected && styles.dayChipSelected, isToday && !isSelected && styles.dayChipToday]}
            >
              <Text style={[styles.dayChipName, isSelected && styles.dayChipNameSelected]}>
                {dayOfWeekName(dayOfWeek).slice(0, 3)}
              </Text>
              <Text style={styles.dayChipDate}>{formatDatePt(date)}</Text>
              {done ? <Feather name="check-circle" size={13} color={colors.success} style={{ marginTop: 3 }} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <Text style={styles.emptyText}>Carregando…</Text>
      ) : (
        <>
          {/* Treino */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Feather name="calendar" size={16} color={colors.ignition} />
              <Text style={styles.cardTitle}>Treino</Text>
            </View>
            {isLoadingDay ? (
              <Text style={styles.emptyText}>Carregando…</Text>
            ) : !selectedDay || selectedDay.isRestDay ? (
              <Text style={styles.emptyText}>Dia de descanso — sem treino planejado.</Text>
            ) : (
              <>
                <Text style={styles.cardSubtitle}>{selectedDay.label || dayOfWeekName(selectedDay.dayOfWeek)}</Text>
                {dayExercises.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhum exercício planejado pra esse dia.</Text>
                ) : (
                  dayExercises.map((pe) => (
                    <Text key={pe.id} style={styles.exerciseLine}>
                      · {pe.exercise.name} {pe.sets ?? '—'}x{pe.reps ?? '—'}
                    </Text>
                  ))
                )}
                <Button
                  label={selectedLog ? 'Desmarcar treino' : 'Marcar treino como concluído'}
                  variant={selectedLog ? 'ghost' : 'primary'}
                  onPress={handleToggleDone}
                  loading={isTogglingDone}
                  style={{ marginTop: spacing.sm }}
                />
              </>
            )}
            <Pressable onPress={() => router.push('/treinos')} style={styles.cardLink}>
              <Text style={styles.cardLinkText}>Ver treino completo</Text>
              <Feather name="chevron-right" size={14} color={colors.ignition} />
            </Pressable>
          </View>

          {/* Nutrição */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Feather name="coffee" size={16} color={colors.ignition} />
              <Text style={styles.cardTitle}>Nutrição</Text>
            </View>
            {isLoadingDay ? (
              <Text style={styles.emptyText}>Carregando…</Text>
            ) : (
              <>
                <Text style={styles.cardSubtitle}>
                  {totals.waterMl}
                  {goals ? ` / ${goals.dailyWaterMl}` : ''} ml água · {Math.round(totals.calories)} kcal ·{' '}
                  {meals.length} {meals.length === 1 ? 'refeição' : 'refeições'}
                </Text>
                <View style={styles.quickAddRow}>
                  {WATER_QUICK_ADD.map((ml) => (
                    <Pressable key={ml} onPress={() => handleAddWater(ml)} disabled={isAddingWater} style={styles.quickAddButton}>
                      <Text style={styles.quickAddText}>+{ml}ml</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <Pressable onPress={() => router.push('/nutrition')} style={styles.cardLink}>
              <Text style={styles.cardLinkText}>Ver nutrição completa</Text>
              <Feather name="chevron-right" size={14} color={colors.ignition} />
            </Pressable>
          </View>

          {/* Recuperação */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Feather name="heart" size={16} color={colors.ignition} />
              <Text style={styles.cardTitle}>Recuperação</Text>
            </View>
            {isLoadingDay ? (
              <Text style={styles.emptyText}>Carregando…</Text>
            ) : !healthEntry ? (
              <Text style={styles.emptyText}>Sem registro de Health nesse dia.</Text>
            ) : (
              <>
                <Text style={styles.cardSubtitle}>
                  Score {scoreAsOfDay ?? '—'} nesse dia
                </Text>
                <Text style={styles.exerciseLine}>
                  {healthEntry.sleepHours != null ? `${healthEntry.sleepHours}h sono` : '—'} ·{' '}
                  {healthEntry.hrvMs != null ? `HRV ${healthEntry.hrvMs}ms` : '—'} ·{' '}
                  {healthEntry.restingHr != null ? `FC ${healthEntry.restingHr}bpm` : '—'} ·{' '}
                  {healthEntry.steps != null ? `${healthEntry.steps} passos` : '—'}
                  {healthEntry.weightKg != null ? ` · ${healthEntry.weightKg}kg` : ''}
                </Text>
              </>
            )}
            <Pressable onPress={() => router.push('/health')} style={styles.cardLink}>
              <Text style={styles.cardLinkText}>Abrir Health</Text>
              <Feather name="chevron-right" size={14} color={colors.ignition} />
            </Pressable>
          </View>
        </>
      )}

      <Text style={styles.footnote}>
        O Planner é um resumo — pra editar exercícios, macros detalhados ou registrar sono/HRV, use o
        módulo específico. Semana atual só, por enquanto.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4 },
  hint: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  weekStrip: { marginBottom: spacing.md },
  dayChip: {
    width: 56,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayChipSelected: { borderColor: colors.ignition, backgroundColor: colors.ignitionMuted },
  dayChipToday: { borderColor: colors.steel },
  dayChipName: { fontFamily: typography.mono, fontSize: 11, color: colors.textMuted, letterSpacing: 1 },
  dayChipNameSelected: { color: colors.ignition },
  dayChipDate: { fontFamily: typography.body, fontSize: 10, color: colors.steel, marginTop: 2 },
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
  cardSubtitle: { fontFamily: typography.body, fontSize: 13, color: colors.textPrimary, marginBottom: spacing.xs },
  exerciseLine: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  quickAddRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  quickAddButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  quickAddText: { fontFamily: typography.bodyMedium, fontSize: 12, color: colors.textPrimary },
  cardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cardLinkText: { fontFamily: typography.bodyMedium, fontSize: 12, color: colors.ignition, marginRight: 4 },
  footnote: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.steel,
    lineHeight: 16,
    marginTop: spacing.lg,
  },
});
