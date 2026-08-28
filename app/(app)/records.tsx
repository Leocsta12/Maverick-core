import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { listLoggedSetsForRecords } from '../../src/lib/workouts';
import { currentPersonalRecords, detectPrHistory, type PersonalRecord } from '../../src/lib/personalRecords';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';

function formatDatePt(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

export default function Records() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [timeline, setTimeline] = useState<PersonalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    if (!user) return;
    setIsLoading(true);
    listLoggedSetsForRecords(user.id)
      .then((sets) => {
        setPrs(currentPersonalRecords(sets));
        setTimeline(detectPrHistory(sets).reverse().slice(0, 15));
      })
      .catch(() => {
        setPrs([]);
        setTimeline([]);
      })
      .finally(() => setIsLoading(false));
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

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
      <Text style={styles.eyebrow}>PRs</Text>
      <Text style={styles.title}>Recordes pessoais</Text>
      <Text style={styles.subtitle}>
        1RM estimado (fórmula de Epley) a partir das séries que você registrou com peso e reps em Treinos.
      </Text>

      {isLoading ? (
        <Text style={styles.emptyText}>Carregando…</Text>
      ) : prs.length === 0 ? (
        <Text style={styles.emptyText}>
          Ainda sem série suficiente pra estimar um recorde. Registre peso e reps (até 12 por série) num treino
          pra começar a aparecer aqui.
        </Text>
      ) : (
        <>
          <View style={styles.grid}>
            {prs.map((pr) => (
              <View key={pr.exerciseId} style={styles.card}>
                <Text style={styles.cardExercise}>{pr.exerciseName}</Text>
                <Text style={styles.cardValue}>{Math.round(pr.estimated1RM)}kg</Text>
                <Text style={styles.cardMeta}>
                  {pr.weightKg}kg × {pr.repsDone} · {formatDatePt(pr.logDate)}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Linha do tempo</Text>
          <View style={styles.timeline}>
            {timeline.map((pr, i) => (
              <View key={`${pr.exerciseId}-${pr.logDate}-${i}`} style={[styles.timelineRow, i === timeline.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.timelineIconWrap}>
                  <Feather name="award" size={14} color={colors.ignition} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.timelineExercise}>{pr.exerciseName}</Text>
                  <Text style={styles.timelineMeta}>
                    {Math.round(pr.estimated1RM)}kg estimado · {pr.weightKg}kg × {pr.repsDone}
                  </Text>
                </View>
                <Text style={styles.timelineDate}>{formatDatePt(pr.logDate)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.footnote}>
        A fórmula de Epley (carga × (1 + reps/30)) é uma estimativa, não uma medição — fica menos confiável acima
        de 12 reps, por isso essas séries não entram no cálculo.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4 },
  subtitle: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, marginTop: 6, marginBottom: spacing.lg, lineHeight: 18 },
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
  },
  cardExercise: { fontFamily: typography.bodyMedium, fontSize: 13, color: colors.textPrimary },
  cardValue: { fontFamily: typography.display, fontSize: 22, color: colors.ignition, marginTop: 4 },
  cardMeta: { fontFamily: typography.mono, fontSize: 10, color: colors.textMuted, marginTop: 4 },
  sectionTitle: {
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  timeline: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timelineIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.ignitionMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineExercise: { fontFamily: typography.bodyMedium, fontSize: 13, color: colors.textPrimary },
  timelineMeta: { fontFamily: typography.mono, fontSize: 10, color: colors.textMuted, marginTop: 2 },
  timelineDate: { fontFamily: typography.mono, fontSize: 11, color: colors.steel },
  footnote: { fontFamily: typography.body, fontSize: 11, color: colors.steel, lineHeight: 16, marginTop: spacing.xl },
});
