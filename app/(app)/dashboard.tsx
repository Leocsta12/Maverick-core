import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { MaverickScoreRing } from '../../src/components/MaverickScoreRing';
import { ModuleCard } from '../../src/components/ModuleCard';
import { computeMaverickScore, listHealthEntries } from '../../src/lib/health';
import { composeDailyBrief, NutritionToday, TrainingToday } from '../../src/lib/missionControl';
import {
  getOrCreatePlan,
  listDayExercises,
  listPlanDays,
  listRecentLogs,
  todayDayOfWeek,
  todayIsoDate as todayIsoDateWorkouts,
} from '../../src/lib/workouts';
import { computeDailyTotals, getGoals, listMeals, listWaterLogs, todayIsoDate as todayIsoDateNutrition } from '../../src/lib/nutrition';

export default function Dashboard() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const firstName = user?.name?.split(' ')[0] ?? 'Atleta';

  const [score, setScore] = useState<number | null>(null);
  const [training, setTraining] = useState<TrainingToday>(null);
  const [nutrition, setNutrition] = useState<NutritionToday>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [entries, plan, meals, waterLogs, goals] = await Promise.all([
        listHealthEntries(user.id),
        getOrCreatePlan(user.id, user.id),
        listMeals(user.id, todayIsoDateNutrition()),
        listWaterLogs(user.id, todayIsoDateNutrition()),
        getGoals(user.id),
      ]);
      setScore(computeMaverickScore(entries));

      const [days, logs] = await Promise.all([listPlanDays(plan.id), listRecentLogs(user.id, 1)]);
      const today = days.find((d) => d.dayOfWeek === todayDayOfWeek()) ?? null;
      if (today) {
        const exercises = today.isRestDay ? [] : await listDayExercises(today.id);
        const isDone = logs.some((l) => l.planDayId === today.id && l.logDate === todayIsoDateWorkouts());
        setTraining({ label: today.label || '', isRestDay: today.isRestDay, totalExercises: exercises.length, isDone });
      } else {
        setTraining(null);
      }

      const totals = computeDailyTotals(meals, waterLogs);
      setNutrition({
        waterMl: totals.waterMl,
        waterGoalMl: goals.dailyWaterMl,
        calories: Math.round(totals.calories),
        calorieGoal: goals.dailyCalories,
        mealsLogged: meals.length,
      });
    } catch {
      // Painel não deve travar por causa de um módulo — cada card lida com o próprio estado vazio.
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const brief = composeDailyBrief(score, training, nutrition);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
    >
      <Text style={styles.eyebrow}>MISSION CONTROL</Text>
      <Text style={styles.greeting}>Olá, {firstName}.</Text>

      <View style={styles.ringWrap}>
        <MaverickScoreRing score={score ?? 0} />
      </View>

      {/* Princípio 001: nunca mostrar um dado sem explicar o que fazer com ele. */}
      <View style={styles.insightCard}>
        <Text style={styles.insightLabel}>DAILY BRIEF</Text>
        <Text style={styles.insightText}>{brief}</Text>
      </View>

      <View style={styles.todayRow}>
        <TrainingTodayCard training={training} isLoading={isLoading} onPress={() => router.push('/treinos')} />
        <NutritionTodayCard nutrition={nutrition} isLoading={isLoading} onPress={() => router.push('/nutrition')} />
      </View>

      <Text style={styles.sectionTitle}>Módulos</Text>
      <View style={styles.grid}>
        <ModuleCard
          icon="camera"
          title="Vision"
          subtitle="Fotos e tendências"
          onPress={() => router.push('/vision')}
        />
        <ModuleCard
          icon="heart"
          title="Health"
          subtitle="Sono, HRV, FC, passos"
          onPress={() => router.push('/health')}
        />
        <ModuleCard
          icon="calendar"
          title="Treinos"
          subtitle="Plano semanal"
          onPress={() => router.push('/treinos')}
        />
        <ModuleCard
          icon="coffee"
          title="Nutrition"
          subtitle="Refeições e água"
          onPress={() => router.push('/nutrition')}
        />
        <ModuleCard
          icon="grid"
          title="Planner"
          subtitle="Semana inteira, junto"
          onPress={() => router.push('/planner')}
        />
        <ModuleCard
          icon="check-square"
          title="Hábitos"
          subtitle="Checklist diário"
          onPress={() => router.push('/mission')}
        />
        <ModuleCard
          icon="users"
          title="Coach"
          subtitle="Painel do treinador"
          onPress={() => router.push('/coach')}
        />
      </View>
    </ScrollView>
  );
}

function TrainingTodayCard({ training, isLoading, onPress }: { training: TrainingToday; isLoading: boolean; onPress: () => void }) {
  const status = isLoading
    ? 'Carregando…'
    : !training
      ? 'Sem plano ainda'
      : training.isRestDay
        ? 'Dia de descanso'
        : training.isDone
          ? 'Concluído ✓'
          : training.totalExercises > 0
            ? `${training.totalExercises} exercício${training.totalExercises === 1 ? '' : 's'}`
            : 'Sem exercícios ainda';

  return (
    <Pressable onPress={onPress} style={[styles.todayCard, training?.isDone && styles.todayCardDone]}>
      <View style={styles.todayCardHeader}>
        <Feather name="calendar" size={15} color={colors.ignition} />
        <Text style={styles.todayCardTitle}>Treino</Text>
      </View>
      <Text style={styles.todayCardStatus}>{status}</Text>
      {training?.label ? <Text style={styles.todayCardMeta}>{training.label}</Text> : null}
    </Pressable>
  );
}

function NutritionTodayCard({ nutrition, isLoading, onPress }: { nutrition: NutritionToday; isLoading: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.todayCard}>
      <View style={styles.todayCardHeader}>
        <Feather name="coffee" size={15} color={colors.ignition} />
        <Text style={styles.todayCardTitle}>Nutrição</Text>
      </View>
      {isLoading || !nutrition ? (
        <Text style={styles.todayCardStatus}>Carregando…</Text>
      ) : (
        <>
          <Text style={styles.todayCardStatus}>
            {nutrition.waterMl}
            <Text style={styles.todayCardMeta}> / {nutrition.waterGoalMl}ml água</Text>
          </Text>
          <Text style={styles.todayCardMeta}>
            {nutrition.calories} kcal{nutrition.calorieGoal ? ` / ${nutrition.calorieGoal}` : ''} · {nutrition.mealsLogged}{' '}
            {nutrition.mealsLogged === 1 ? 'refeição' : 'refeições'}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  greeting: { fontFamily: typography.display, fontSize: 28, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.lg },
  ringWrap: { alignItems: 'center', marginBottom: spacing.lg },
  insightCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  insightLabel: { fontFamily: typography.mono, fontSize: 10, color: colors.steel, letterSpacing: 1.5, marginBottom: spacing.xs },
  insightText: { fontFamily: typography.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  todayRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  todayCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  todayCardDone: { borderColor: colors.success },
  todayCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  todayCardTitle: { fontFamily: typography.mono, fontSize: 10, color: colors.steel, letterSpacing: 1.2, marginLeft: 4 },
  todayCardStatus: { fontFamily: typography.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  todayCardMeta: { fontFamily: typography.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  sectionTitle: { fontFamily: typography.bodySemiBold, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
