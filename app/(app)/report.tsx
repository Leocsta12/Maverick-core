import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { getWeeklyDigestForUser, TREND_LABELS, type WeeklyDigest, type WeeklyTrend } from '../../src/lib/weeklyDigest';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';

function formatDatePt(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

function TrendCard({ label, unit, data, format }: { label: string; unit?: string; data: WeeklyTrend; format?: (n: number) => string }) {
  const fmt = format ?? ((n: number) => Math.round(n).toString());
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      {data.current == null ? (
        <Text style={styles.cardEmpty}>Sem dado essa semana</Text>
      ) : (
        <>
          <Text style={styles.cardValue}>
            {fmt(data.current)}
            {unit ? <Text style={styles.cardUnit}> {unit}</Text> : null}
          </Text>
          <Text style={styles.cardTrend}>
            {TREND_LABELS[data.trend]}
            {data.previous != null ? ` · semana passada: ${fmt(data.previous)}${unit ? ` ${unit}` : ''}` : ''}
          </Text>
        </>
      )}
    </View>
  );
}

export default function Report() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    if (!user) return;
    setIsLoading(true);
    getWeeklyDigestForUser(user.id)
      .then(setDigest)
      .catch(() => setDigest(null))
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
      <Text style={styles.eyebrow}>RELATÓRIO</Text>
      <Text style={styles.title}>Sua semana</Text>
      {digest ? (
        <Text style={styles.subtitle}>Semana de {formatDatePt(digest.weekStartIso)} — comparado com a anterior.</Text>
      ) : null}

      {isLoading ? (
        <Text style={styles.emptyText}>Carregando…</Text>
      ) : !digest ? (
        <Text style={styles.emptyText}>Não foi possível carregar o relatório agora.</Text>
      ) : (
        <>
          {digest.newPRs.length > 0 && (
            <View style={styles.prBanner}>
              <Feather name="award" size={18} color={colors.ignition} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.prBannerTitle}>
                  {digest.newPRs.length === 1 ? 'Novo recorde essa semana!' : `${digest.newPRs.length} novos recordes essa semana!`}
                </Text>
                <Text style={styles.prBannerText}>
                  {digest.newPRs
                    .map((pr) => `${pr.exerciseName} (${Math.round(pr.estimated1RM)}kg)`)
                    .join(' · ')}
                </Text>
              </View>
            </View>
          )}
          <View style={styles.grid}>
          <TrendCard label="CARGA DE TREINO" data={digest.load} />
          <TrendCard label="VOLUME (SÉRIES)" data={digest.volume} />
          <TrendCard label="PRONTIDÃO" data={digest.readiness} />
          <View style={styles.card}>
            <Text style={styles.cardLabel}>NUTRIÇÃO</Text>
            <Text style={styles.cardValue}>
              {digest.nutritionAdherence.daysLogged}/{digest.nutritionAdherence.totalDays}
            </Text>
            <Text style={styles.cardTrend}>dias com refeição registrada</Text>
          </View>
          </View>
        </>
      )}

      <Text style={styles.footnote}>
        Carga e volume comparam a semana atual (segunda a hoje) com a mesma janela da semana passada. Prontidão é a
        média do Maverick Score dos dias com registro em Health. Variações de até 8% contam como estáveis.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4 },
  subtitle: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, marginTop: 6, marginBottom: spacing.lg },
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  prBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ignitionMuted,
    borderWidth: 1,
    borderColor: colors.ignition,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  prBannerTitle: { fontFamily: typography.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  prBannerText: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    minHeight: 92,
  },
  cardLabel: { fontFamily: typography.mono, fontSize: 10, color: colors.steel, letterSpacing: 1 },
  cardValue: { fontFamily: typography.display, fontSize: 22, color: colors.ignition, marginTop: 6 },
  cardUnit: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted },
  cardTrend: { fontFamily: typography.body, fontSize: 11, color: colors.textMuted, marginTop: 4, lineHeight: 15 },
  cardEmpty: { fontFamily: typography.body, fontSize: 12, color: colors.steel, marginTop: 6 },
  footnote: { fontFamily: typography.body, fontSize: 11, color: colors.steel, lineHeight: 16, marginTop: spacing.xl },
});
