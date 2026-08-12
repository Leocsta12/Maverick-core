import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radius } from '../../src/theme/tokens';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { showAlert } from '../../src/lib/alert';
import {
  MissionCompletion,
  MissionHabit,
  addHabit,
  archiveHabit,
  computeStreak,
  listHabits,
  listRecentCompletions,
  markDone,
  markUndone,
  todayIsoDate,
} from '../../src/lib/mission';

export default function Mission() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [habits, setHabits] = useState<MissionHabit[]>([]);
  const [completions, setCompletions] = useState<MissionCompletion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [pendingHabitId, setPendingHabitId] = useState<string | null>(null);

  const today = todayIsoDate();

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [habitsData, completionsData] = await Promise.all([
        listHabits(user.id),
        listRecentCompletions(user.id),
      ]);
      setHabits(habitsData);
      setCompletions(completionsData);
    } catch {
      showAlert('Não foi possível carregar seus hábitos.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const doneToday = useMemo(
    () => new Set(completions.filter((c) => c.completedDate === today).map((c) => c.habitId)),
    [completions, today]
  );

  const handleAddHabit = async () => {
    if (!user || !newTitle.trim()) return;
    setIsAdding(true);
    try {
      await addHabit(user.id, newTitle, habits.length);
      setNewTitle('');
      await load();
    } catch {
      showAlert('Não foi possível adicionar o hábito.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggle = async (habit: MissionHabit) => {
    if (!user || pendingHabitId) return;
    setPendingHabitId(habit.id);
    const wasDone = doneToday.has(habit.id);
    try {
      if (wasDone) {
        await markUndone(habit.id, today);
      } else {
        await markDone(user.id, habit.id, today);
      }
      await load();
    } catch {
      showAlert('Não foi possível atualizar o hábito.');
    } finally {
      setPendingHabitId(null);
    }
  };

  const handleArchive = (habit: MissionHabit) => {
    showAlert('Remover hábito?', `"${habit.title}" sai da sua lista, mas o histórico é mantido.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await archiveHabit(habit.id);
          await load();
        },
      },
    ]);
  };

  const doneCount = habits.filter((h) => doneToday.has(h.id)).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
    >
      <Text style={styles.eyebrow}>HÁBITOS</Text>
      <Text style={styles.title}>Hábitos de hoje</Text>

      {habits.length > 0 && (
        <View style={styles.progressCard}>
          <Text style={styles.progressValue}>
            {doneCount}/{habits.length}
          </Text>
          <Text style={styles.progressLabel}>CONCLUÍDOS HOJE</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Sua lista</Text>
      {isLoading ? (
        <Text style={styles.emptyText}>Carregando…</Text>
      ) : habits.length === 0 ? (
        <Text style={styles.emptyText}>
          Nenhum hábito ainda. Adicione o primeiro logo abaixo — ex: "Dormir 8h", "Beber 2L de água".
        </Text>
      ) : (
        habits.map((habit) => {
          const isDone = doneToday.has(habit.id);
          const streak = computeStreak(habit.id, completions);
          return (
            <Pressable
              key={habit.id}
              onPress={() => handleToggle(habit)}
              onLongPress={() => handleArchive(habit)}
              style={styles.habitRow}
            >
              <View style={[styles.checkbox, isDone && styles.checkboxDone]}>
                {isDone ? <Feather name="check" size={16} color={colors.bg} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.habitTitle, isDone && styles.habitTitleDone]}>{habit.title}</Text>
                {streak > 0 ? (
                  <Text style={styles.streakText}>
                    🔥 {streak} {streak === 1 ? 'dia seguido' : 'dias seguidos'}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}

      <Text style={styles.sectionTitle}>Adicionar hábito</Text>
      <TextField
        label="Novo hábito"
        value={newTitle}
        onChangeText={setNewTitle}
        placeholder="Ex: Treinar 30 minutos"
        onSubmitEditing={handleAddHabit}
      />
      <Button label="Adicionar" onPress={handleAddHabit} loading={isAdding} disabled={!newTitle.trim()} />

      <Text style={styles.footnote}>Toque pra marcar como feito hoje. Toque e segure pra remover.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.lg },
  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  progressValue: { fontFamily: typography.display, fontSize: 40, color: colors.textPrimary },
  progressLabel: { fontFamily: typography.mono, fontSize: 11, color: colors.steel, letterSpacing: 2, marginTop: 2 },
  sectionTitle: {
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 4,
  },
  checkboxDone: { backgroundColor: colors.ignition, borderColor: colors.ignition },
  habitTitle: { fontFamily: typography.bodyMedium, fontSize: 15, color: colors.textPrimary },
  habitTitleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  streakText: { fontFamily: typography.mono, fontSize: 11, color: colors.steel, marginTop: 2 },
  footnote: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.steel,
    lineHeight: 16,
    marginTop: spacing.xl,
  },
});
