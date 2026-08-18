import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radius } from '../../src/theme/tokens';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { showAlert } from '../../src/lib/alert';
import {
  CoachLink,
  LinkedPerson,
  getMyCoachCode,
  listMyAthletes,
  listMyCoaches,
  listPendingForMe,
  removeLink,
  requestCoachLink,
  respondToLink,
} from '../../src/lib/coach';
import { AthleteOverview, CheckInSeverity, checkInStatus, getAthleteOverview } from '../../src/lib/coachOverview';
import { HealthEntry, computeMaverickScore, deriveInsight, listHealthEntries } from '../../src/lib/health';
import {
  MissionCompletion,
  MissionHabit,
  computeStreak,
  listHabits,
  listRecentCompletions,
  todayIsoDate,
} from '../../src/lib/mission';
import {
  DailyTotals,
  computeDailyTotals,
  getGoals,
  listMeals,
  listWaterLogs,
  mealTypeLabel,
  Meal,
  NutritionGoals,
  todayIsoDate as todayIsoDateNutrition,
} from '../../src/lib/nutrition';
import { VisionPhoto, analyzeVisionPhotos, listVisionPhotos } from '../../src/lib/vision';
import { WorkoutWeek } from '../../src/components/WorkoutWeek';

type PendingItem = CoachLink & { counterpart: LinkedPerson; iAmCoach: boolean };
type AthleteItem = { linkId: string; athlete: LinkedPerson };

export default function Coach() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [coachCode, setCoachCode] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const [pending, setPending] = useState<PendingItem[]>([]);
  const [athletes, setAthletes] = useState<AthleteItem[]>([]);
  const [coaches, setCoaches] = useState<Awaited<ReturnType<typeof listMyCoaches>>>([]);
  const [overviews, setOverviews] = useState<Record<string, AthleteOverview>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOverviews, setIsLoadingOverviews] = useState(true);

  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [code, pendingList, athletesList, coachesList] = await Promise.all([
        getMyCoachCode(user.id),
        listPendingForMe(user.id),
        listMyAthletes(user.id),
        listMyCoaches(user.id),
      ]);
      setCoachCode(code);
      setPending(pendingList);
      setAthletes(athletesList);
      setCoaches(coachesList);

      // Painel de todos os atletas: busca score + última atividade de cada um
      // em paralelo. Isolado do try/catch principal — se der errado pra um
      // atleta, os outros continuam aparecendo normalmente.
      setIsLoadingOverviews(true);
      Promise.all(
        athletesList.map(async (a) => {
          try {
            return [a.athlete.id, await getAthleteOverview(a.athlete.id)] as const;
          } catch {
            return [a.athlete.id, { score: null, lastCheckInDate: null }] as const;
          }
        })
      )
        .then((entries) => setOverviews(Object.fromEntries(entries)))
        .finally(() => setIsLoadingOverviews(false));
    } catch {
      showAlert('Não foi possível carregar seus dados de Coach.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLink = async () => {
    if (!linkCode.trim()) return;
    setIsLinking(true);
    try {
      const { error } = await requestCoachLink(linkCode);
      if (error) {
        showAlert(error);
      } else {
        setLinkCode('');
        showAlert('Pedido enviado! Assim que for aceito, o vínculo aparece aqui.');
        await load();
      }
    } finally {
      setIsLinking(false);
    }
  };

  const handleRespond = async (link: PendingItem, accept: boolean) => {
    await respondToLink(link.id, accept);
    await load();
  };

  const handleRemove = (linkId: string) => {
    showAlert('Remover vínculo?', 'Isso encerra o compartilhamento de dados dos dois lados.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await removeLink(linkId);
          if (selectedAthleteId) setSelectedAthleteId(null);
          await load();
        },
      },
    ]);
  };

  const selectedAthlete = athletes.find((a) => a.athlete.id === selectedAthleteId);

  const severityRank: Record<CheckInSeverity, number> = { stale: 3, warn: 2, none: 1, ok: 0 };
  const sortedAthletes = useMemo(() => {
    return [...athletes].sort((a, b) => {
      const severityA = checkInStatus(overviews[a.athlete.id]?.lastCheckInDate ?? null).severity;
      const severityB = checkInStatus(overviews[b.athlete.id]?.lastCheckInDate ?? null).severity;
      const diff = severityRank[severityB] - severityRank[severityA];
      return diff !== 0 ? diff : a.athlete.name.localeCompare(b.athlete.name);
    });
  }, [athletes, overviews]);

  const staleCount = athletes.filter(
    (a) => checkInStatus(overviews[a.athlete.id]?.lastCheckInDate ?? null).severity === 'stale'
  ).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
    >
      <Text style={styles.eyebrow}>COACH</Text>
      <Text style={styles.title}>Painel do treinador</Text>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>SEU CÓDIGO</Text>
        <Text style={styles.codeValue}>{coachCode ?? '—'}</Text>
        <Text style={styles.codeHint}>Compartilhe com seus atletas para eles se vincularem a você.</Text>
      </View>

      <Text style={styles.sectionTitle}>Vincular a um treinador</Text>
      <TextField
        label="Código do treinador"
        value={linkCode}
        onChangeText={setLinkCode}
        placeholder="Ex: A1B2C3"
        autoCapitalize="characters"
      />
      <Button label="Enviar pedido" onPress={handleLink} loading={isLinking} disabled={!linkCode.trim()} />

      {pending.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pedidos pendentes</Text>
          {pending.map((link) => (
            <View key={link.id} style={styles.pendingRow}>
              <Text style={styles.pendingText}>
                <Text style={styles.pendingName}>{link.counterpart.name}</Text>
                {link.iAmCoach ? ' quer se vincular a você como atleta.' : ' quer ser seu treinador.'}
              </Text>
              <View style={styles.pendingActions}>
                <Button label="Recusar" variant="ghost" onPress={() => handleRespond(link, false)} style={{ flex: 1, marginRight: spacing.sm }} />
                <Button label="Aceitar" onPress={() => handleRespond(link, true)} style={{ flex: 1 }} />
              </View>
            </View>
          ))}
        </>
      )}

      <View style={styles.athletesHeaderRow}>
        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Seus atletas</Text>
        {!isLoading && athletes.length > 0 && (
          <Text style={[styles.athletesSummary, staleCount > 0 && styles.athletesSummaryWarn]}>
            {athletes.length} vinculado{athletes.length === 1 ? '' : 's'}
            {staleCount > 0 ? ` · ${staleCount} sem check-in há dias` : ''}
          </Text>
        )}
      </View>
      {isLoading ? (
        <Text style={styles.emptyText}>Carregando…</Text>
      ) : athletes.length === 0 ? (
        <Text style={styles.emptyText}>
          Nenhum atleta vinculado ainda. Compartilhe seu código acima pra alguém se vincular a você.
        </Text>
      ) : (
        sortedAthletes.map((item) => {
          const overview = overviews[item.athlete.id];
          const status = checkInStatus(overview?.lastCheckInDate ?? null);
          return (
            <Pressable
              key={item.linkId}
              onPress={() => setSelectedAthleteId(selectedAthleteId === item.athlete.id ? null : item.athlete.id)}
              onLongPress={() => handleRemove(item.linkId)}
              style={[styles.athleteRow, selectedAthleteId === item.athlete.id && styles.athleteRowSelected]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.athleteName}>{item.athlete.name}</Text>
                <View style={styles.athleteStatusRow}>
                  <View style={[styles.statusDot, styles[`statusDot_${status.severity}`]]} />
                  <Text style={styles.athleteStatusText}>
                    {isLoadingOverviews && !overview ? 'Carregando…' : status.label}
                  </Text>
                </View>
              </View>
              {overview?.score != null && (
                <View style={styles.athleteScoreWrap}>
                  <Text style={styles.athleteScoreValue}>{overview.score}</Text>
                  <Text style={styles.athleteScoreLabel}>SCORE</Text>
                </View>
              )}
              <Feather
                name={selectedAthleteId === item.athlete.id ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.steel}
                style={{ marginLeft: spacing.xs }}
              />
            </Pressable>
          );
        })
      )}

      {selectedAthlete && <AthleteDetail athleteId={selectedAthlete.athlete.id} athleteName={selectedAthlete.athlete.name} />}

      {coaches.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Seus treinadores</Text>
          {coaches.map((item) => (
            <Pressable key={item.linkId} onLongPress={() => handleRemove(item.linkId)} style={styles.athleteRow}>
              <Text style={styles.athleteName}>{item.coach.name}</Text>
              <Text style={styles.athleteHint}>Toque e segure pra desvincular</Text>
            </Pressable>
          ))}
        </>
      )}

      <Text style={styles.footnote}>
        Toque num atleta pra abrir os detalhes, toque e segure pra remover o vínculo. "Check-in" é a
        data da atividade mais recente dele em qualquer módulo (Health, Treinos, Hábitos ou
        Nutrition) — não é uma ação separada, ninguém precisa avisar que está ativo. Ao aceitar um
        pedido como treinador, você passa a ver o Maverick Score, os hábitos e as fotos de progresso
        desse atleta.
      </Text>
    </ScrollView>
  );
}

// Exportado pra reuso em Admin (app/(app)/admin.tsx) — mesma tela de
// detalhe, só que chegando ali sem vínculo de Coach, via as policies
// "select as admin" (RLS, ver schema.sql). canEdit controla só a UI
// (mostrar ou não os controles de montar treino); a trava de verdade é a
// RLS em si — não existe policy de escrita "as admin" em nenhuma tabela,
// então mesmo que a UI liberasse, o banco recusaria.
export function AthleteDetail({
  athleteId,
  athleteName,
  canEdit = true,
}: {
  athleteId: string;
  athleteName: string;
  canEdit?: boolean;
}) {
  const [healthEntries, setHealthEntries] = useState<HealthEntry[]>([]);
  const [habits, setHabits] = useState<MissionHabit[]>([]);
  const [completions, setCompletions] = useState<MissionCompletion[]>([]);
  const [todayMeals, setTodayMeals] = useState<Meal[]>([]);
  const [nutritionGoals, setNutritionGoals] = useState<NutritionGoals | null>(null);
  const [nutritionTotals, setNutritionTotals] = useState<DailyTotals | null>(null);
  const [photos, setPhotos] = useState<VisionPhoto[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setSelectedPhotoIds([]);
    setAnalysis(null);
    const today = todayIsoDateNutrition();
    Promise.all([
      listHealthEntries(athleteId),
      listHabits(athleteId),
      listRecentCompletions(athleteId),
      listVisionPhotos(athleteId),
      listMeals(athleteId, today),
      listWaterLogs(athleteId, today),
      getGoals(athleteId),
    ])
      .then(([entries, habitsList, completionsList, photosList, meals, waterLogs, goals]) => {
        if (!active) return;
        setHealthEntries(entries);
        setHabits(habitsList);
        setCompletions(completionsList);
        setPhotos(photosList);
        setTodayMeals(meals);
        setNutritionGoals(goals);
        setNutritionTotals(computeDailyTotals(meals, waterLogs));
      })
      .catch(() => showAlert('Não foi possível carregar os dados desse atleta.'))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [athleteId]);

  const score = computeMaverickScore(healthEntries);
  const today = todayIsoDate();
  const doneToday = completions.filter((c) => c.completedDate === today).length;

  const togglePhoto = (id: string) => {
    setAnalysis(null);
    setSelectedPhotoIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const selectedPhotos = useMemo(
    () =>
      selectedPhotoIds
        .map((id) => photos.find((p) => p.id === id))
        .filter((p): p is VisionPhoto => !!p)
        .sort((a, b) => a.takenDate.localeCompare(b.takenDate)),
    [selectedPhotoIds, photos]
  );

  const handleAnalyze = async () => {
    if (selectedPhotos.length !== 2) return;
    setIsAnalyzing(true);
    setAnalysis(null);
    try {
      const result = await analyzeVisionPhotos(selectedPhotos[0].id, selectedPhotos[1].id);
      setAnalysis(result);
    } catch {
      showAlert('Não foi possível analisar as fotos agora.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.detailCard}>
        <Text style={styles.emptyText}>Carregando dados de {athleteName}…</Text>
      </View>
    );
  }

  return (
    <View style={styles.detailCard}>
      <Text style={styles.detailTitle}>{athleteName}</Text>

      <View style={styles.detailScoreRow}>
        <View style={styles.detailStat}>
          <Text style={styles.detailStatValue}>{score ?? '—'}</Text>
          <Text style={styles.detailStatLabel}>MAVERICK SCORE</Text>
        </View>
        <View style={styles.detailStat}>
          <Text style={styles.detailStatValue}>
            {doneToday}/{habits.length}
          </Text>
          <Text style={styles.detailStatLabel}>HÁBITOS HOJE</Text>
        </View>
      </View>
      <Text style={styles.detailInsight}>{deriveInsight(score)}</Text>

      {habits.length > 0 && (
        <View style={{ marginTop: spacing.md }}>
          {habits.map((habit) => {
            const streak = computeStreak(habit.id, completions);
            const done = completions.some((c) => c.habitId === habit.id && c.completedDate === today);
            return (
              <Text key={habit.id} style={styles.habitLine}>
                {done ? '✓' : '·'} {habit.title}
                {streak > 0 ? `  🔥 ${streak}` : ''}
              </Text>
            );
          })}
        </View>
      )}

      <Text style={styles.detailSubtitle}>Plano de treino</Text>
      <Text style={styles.hint}>
        {canEdit ? 'Você pode montar e editar o treino semanal desse atleta.' : 'Só leitura — sem edição pelo painel de admin.'}
      </Text>
      <WorkoutWeek athleteUserId={athleteId} canEditPlan={canEdit} />

      <Text style={styles.detailSubtitle}>Nutrição hoje</Text>
      {todayMeals.length === 0 ? (
        <Text style={styles.emptyText}>Esse atleta ainda não registrou refeições hoje.</Text>
      ) : (
        <>
          <View style={styles.detailScoreRow}>
            <View style={styles.detailStat}>
              <Text style={styles.detailStatValue}>
                {Math.round(nutritionTotals?.calories ?? 0)}
                {nutritionGoals?.dailyCalories ? <Text style={styles.detailStatMeta}> / {nutritionGoals.dailyCalories}</Text> : null}
              </Text>
              <Text style={styles.detailStatLabel}>KCAL</Text>
            </View>
            <View style={styles.detailStat}>
              <Text style={styles.detailStatValue}>
                {nutritionTotals?.waterMl ?? 0}
                <Text style={styles.detailStatMeta}> / {nutritionGoals?.dailyWaterMl ?? 2000}ml</Text>
              </Text>
              <Text style={styles.detailStatLabel}>ÁGUA</Text>
            </View>
          </View>
          <View style={{ marginTop: spacing.sm }}>
            {todayMeals.map((meal) => (
              <Text key={meal.id} style={styles.habitLine}>
                · {mealTypeLabel(meal.mealType)}: {meal.name}
                {meal.calories ? ` (${meal.calories} kcal)` : ''}
              </Text>
            ))}
          </View>
        </>
      )}

      <Text style={styles.detailSubtitle}>Fotos de progresso</Text>
      {photos.length === 0 ? (
        <Text style={styles.emptyText}>Esse atleta ainda não enviou fotos.</Text>
      ) : (
        <>
          <Text style={styles.hint}>Toque em até 2 fotos para comparar.</Text>
          <View style={styles.grid}>
            {photos.map((photo) => {
              const isSelected = selectedPhotoIds.includes(photo.id);
              return (
                <Pressable
                  key={photo.id}
                  onPress={() => togglePhoto(photo.id)}
                  style={[styles.thumbWrap, isSelected && styles.thumbSelected]}
                >
                  <Image source={{ uri: photo.publicUrl }} style={styles.thumb} />
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {selectedPhotos.length === 2 && (
        <>
          <Button label="Analisar com IA" onPress={handleAnalyze} loading={isAnalyzing} style={{ marginTop: spacing.md }} />
          {analysis ? (
            <View style={styles.analysisBox}>
              <Text style={styles.analysisLabel}>ANÁLISE</Text>
              <Text style={styles.analysisText}>{analysis}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.lg },
  codeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  codeLabel: { fontFamily: typography.mono, fontSize: 10, color: colors.steel, letterSpacing: 1.5 },
  codeValue: { fontFamily: typography.display, fontSize: 32, color: colors.ignition, letterSpacing: 4, marginTop: 4 },
  codeHint: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' },
  sectionTitle: {
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  hint: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  pendingRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm,
  },
  pendingText: { fontFamily: typography.body, fontSize: 13, color: colors.textPrimary, marginBottom: spacing.sm },
  pendingName: { fontFamily: typography.bodySemiBold },
  pendingActions: { flexDirection: 'row' },
  athleteRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  athleteRowSelected: { borderColor: colors.ignition },
  athleteName: { fontFamily: typography.bodyMedium, fontSize: 15, color: colors.textPrimary },
  athleteHint: { fontFamily: typography.mono, fontSize: 10, color: colors.steel },
  athletesHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' },
  athletesSummary: { fontFamily: typography.mono, fontSize: 11, color: colors.textMuted, letterSpacing: 0.3 },
  athletesSummaryWarn: { color: colors.warning },
  athleteStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDot_ok: { backgroundColor: colors.success },
  statusDot_warn: { backgroundColor: colors.warning },
  statusDot_stale: { backgroundColor: colors.danger },
  statusDot_none: { backgroundColor: colors.steel },
  athleteStatusText: { fontFamily: typography.body, fontSize: 11, color: colors.textMuted, marginLeft: 2 },
  athleteScoreWrap: { alignItems: 'center', marginLeft: spacing.sm },
  athleteScoreValue: { fontFamily: typography.display, fontSize: 18, color: colors.textPrimary },
  athleteScoreLabel: { fontFamily: typography.mono, fontSize: 8, color: colors.steel, letterSpacing: 1 },
  detailCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  detailTitle: { fontFamily: typography.bodySemiBold, fontSize: 17, color: colors.textPrimary, marginBottom: spacing.sm },
  detailScoreRow: { flexDirection: 'row', gap: spacing.lg },
  detailStat: { alignItems: 'flex-start' },
  detailStatValue: { fontFamily: typography.display, fontSize: 28, color: colors.textPrimary },
  detailStatMeta: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted },
  detailStatLabel: { fontFamily: typography.mono, fontSize: 9, color: colors.steel, letterSpacing: 1 },
  detailInsight: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },
  habitLine: { fontFamily: typography.body, fontSize: 13, color: colors.textPrimary, marginBottom: 2 },
  detailSubtitle: {
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: {
    width: 72,
    height: 96,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  thumbSelected: { borderColor: colors.ignition },
  thumb: { width: '100%', height: '100%', backgroundColor: colors.surface },
  analysisBox: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
  },
  analysisLabel: { fontFamily: typography.mono, fontSize: 10, color: colors.steel, letterSpacing: 1.5, marginBottom: spacing.xs },
  analysisText: { fontFamily: typography.body, fontSize: 13, color: colors.textPrimary, lineHeight: 20 },
  footnote: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.steel,
    lineHeight: 16,
    marginTop: spacing.xl,
  },
});
