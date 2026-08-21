import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography, radius } from '../theme/tokens';
import { TextField } from './TextField';
import { Button } from './Button';
import { showAlert } from '../lib/alert';
import { OfflineBanner } from './OfflineBanner';
import { loadWithCache } from '../lib/offlineCache';
import { flushOfflineQueue, markDayDoneOffline, markDayUndoneOffline, queuedWriteCount } from '../lib/offlineSync';
import {
  AthleteLevel,
  Exercise,
  LoggedSetEntry,
  SetEntry,
  WorkoutLog,
  WorkoutPlan,
  WorkoutPlanDay,
  WorkoutPlanExercise,
  addExercise,
  addExerciseToDay,
  dayOfWeekName,
  generateAIPlan,
  getLastCompletedSets,
  getOrCreatePlan,
  listDayExercises,
  listExercises,
  listLogSets,
  listPlanDays,
  listRecentLoggedSets,
  listRecentLogs,
  removeExerciseFromDay,
  saveLogSets,
  setExerciseVideoUrl,
  todayDayOfWeek,
  todayIsoDate,
  updateDay,
  uploadExercisePhoto,
} from '../lib/workouts';
import { currentAndPreviousWeek } from '../lib/trainingLoad';
import { parseRepsTarget, suggestProgression, type OverloadSuggestion } from '../lib/progressiveOverload';
import { volumeTier, VOLUME_TIER_LABELS, weeklyVolumeByMuscleGroup } from '../lib/muscleVolume';

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

type Props = {
  athleteUserId: string;
  canEditPlan: boolean;
};

export function WorkoutWeek({ athleteUserId, canEditPlan }: Props) {
  const { user } = useAuth();
  const isAthleteViewingSelf = user?.id === athleteUserId;

  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [days, setDays] = useState<WorkoutPlanDay[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [dayExercises, setDayExercises] = useState<WorkoutPlanExercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDay, setIsLoadingDay] = useState(false);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await loadWithCache(`treinos:${athleteUserId}`, async () => {
        const loadedPlan = await getOrCreatePlan(athleteUserId, user.id);
        const [planDays, recentLogs] = await Promise.all([listPlanDays(loadedPlan.id), listRecentLogs(athleteUserId)]);
        return { plan: loadedPlan, days: planDays, logs: recentLogs };
      });
      setPlan(result.data.plan);
      setDays(result.data.days);
      let logs = result.data.logs;
      setOfflineSince(result.isFromCache ? result.cachedAt : null);
      setSelectedDayId(
        (prev) => prev ?? result.data.days.find((d) => d.dayOfWeek === todayDayOfWeek())?.id ?? result.data.days[0]?.id ?? null
      );

      // Veio da rede de verdade — tenta despachar qualquer marcação de
      // treino que ficou pendente de quando estava offline.
      if (!result.isFromCache) {
        const { synced } = await flushOfflineQueue();
        if (synced > 0) logs = await listRecentLogs(athleteUserId);
      }
      setLogs(logs);
      setPendingWrites(await queuedWriteCount());
    } catch {
      showAlert('Não foi possível carregar o plano de treino.');
    } finally {
      setIsLoading(false);
    }
  }, [athleteUserId, user]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDayExercises = useCallback(async (dayId: string) => {
    setIsLoadingDay(true);
    try {
      const result = await loadWithCache(`treinos:day:${dayId}`, () => listDayExercises(dayId));
      setDayExercises(result.data);
      if (result.isFromCache) setOfflineSince((prev) => prev ?? result.cachedAt);
    } catch {
      showAlert('Não foi possível carregar os exercícios do dia.');
    } finally {
      setIsLoadingDay(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDayId) loadDayExercises(selectedDayId);
  }, [selectedDayId, loadDayExercises]);

  const selectedDay = days.find((d) => d.id === selectedDayId) ?? null;
  const selectedDate = selectedDay ? dateForDayOfWeek(selectedDay.dayOfWeek) : null;
  const selectedLog = selectedDay ? logs.find((l) => l.planDayId === selectedDay.id && l.logDate === selectedDate) : undefined;

  const refreshLogs = useCallback(async () => {
    setLogs(await listRecentLogs(athleteUserId));
  }, [athleteUserId]);

  const handleToggleDone = async () => {
    if (!user || !selectedDay || !selectedDate) return;
    try {
      if (selectedLog) {
        const result = await markDayUndoneOffline(selectedDay.id, selectedDate);
        if (result.queued) {
          setLogs((prev) => prev.filter((l) => !(l.planDayId === selectedDay.id && l.logDate === selectedDate)));
          setPendingWrites(await queuedWriteCount());
          showAlert('Sem conexão agora — salvo no aparelho. Sincroniza sozinho assim que a internet voltar.');
          return;
        }
      } else {
        const result = await markDayDoneOffline(user.id, selectedDay.id, selectedDate);
        if (result.queued) {
          setLogs((prev) => [
            ...prev,
            { id: `pending-${selectedDay.id}-${selectedDate}`, planDayId: selectedDay.id, logDate: selectedDate, completed: true },
          ]);
          setPendingWrites(await queuedWriteCount());
          showAlert('Sem conexão agora — salvo no aparelho. Sincroniza sozinho assim que a internet voltar.');
          return;
        }
      }
      await refreshLogs();
    } catch {
      showAlert('Não foi possível salvar agora — confira sua conexão.');
    }
  };

  if (isLoading) {
    return <Text style={styles.emptyText}>Carregando plano de treino…</Text>;
  }

  return (
    <View>
      <OfflineBanner cachedAt={offlineSince} />
      {pendingWrites > 0 && (
        <Text style={styles.pendingNote}>
          {pendingWrites} {pendingWrites === 1 ? 'alteração' : 'alterações'} aguardando conexão pra sincronizar.
        </Text>
      )}

      {canEditPlan && (
        <AIPlanGenerator
          plan={plan}
          onGenerate={async (fields) => {
            if (!user) return;
            await generateAIPlan(athleteUserId, user.id, fields);
            await load();
            if (selectedDayId) await loadDayExercises(selectedDayId);
          }}
        />
      )}

      <MuscleVolumeCard athleteUserId={athleteUserId} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekStrip}>
        {days.map((day) => {
          const date = dateForDayOfWeek(day.dayOfWeek);
          const done = logs.some((l) => l.planDayId === day.id && l.logDate === date);
          const isSelected = day.id === selectedDayId;
          return (
            <Pressable
              key={day.id}
              onPress={() => setSelectedDayId(day.id)}
              style={[styles.dayChip, isSelected && styles.dayChipSelected, day.isRestDay && styles.dayChipRest]}
            >
              <Text style={[styles.dayChipName, isSelected && styles.dayChipNameSelected]}>
                {dayOfWeekName(day.dayOfWeek).slice(0, 3)}
              </Text>
              <Text style={styles.dayChipDate}>{formatDatePt(date)}</Text>
              {done ? <Feather name="check-circle" size={14} color={colors.success} style={{ marginTop: 4 }} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedDay && (
        <DayDetail
          day={selectedDay}
          exercises={dayExercises}
          isLoading={isLoadingDay}
          canEditPlan={canEditPlan}
          isAthleteViewingSelf={isAthleteViewingSelf}
          isDone={!!selectedLog}
          logId={selectedLog?.id ?? null}
          onToggleDone={handleToggleDone}
          onDayUpdated={async (patch) => {
            await updateDay(selectedDay.id, patch);
            setDays((prev) => prev.map((d) => (d.id === selectedDay.id ? { ...d, ...patch } : d)));
          }}
          onExercisesChanged={() => loadDayExercises(selectedDay.id)}
        />
      )}
    </View>
  );
}

const LEVEL_OPTIONS: { value: AthleteLevel; label: string }[] = [
  { value: 'iniciante', label: 'Iniciante' },
  { value: 'intermediario', label: 'Intermediário' },
  { value: 'avancado', label: 'Avançado' },
];

// Painel do Maverick Coach IA — monta o plano semanal inteiro pela Claude
// API, calibrado pelo nível informado. Pensado sobretudo pra quem treina
// sozinho (sem treinador humano), mas o treinador também pode usar como
// ponto de partida e depois ajustar à mão pelo resto da tela.
function AIPlanGenerator({
  plan,
  onGenerate,
}: {
  plan: WorkoutPlan | null;
  onGenerate: (fields: { level: AthleteLevel; goal?: string; daysPerWeek: number; equipmentNotes?: string }) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [level, setLevel] = useState<AthleteLevel>(plan?.level ?? 'iniciante');
  const [goal, setGoal] = useState(plan?.goal ?? '');
  const [daysPerWeek, setDaysPerWeek] = useState('3');
  const [equipmentNotes, setEquipmentNotes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    const days = Math.min(6, Math.max(1, Number(daysPerWeek) || 3));
    showAlert(
      'Gerar treino com IA?',
      'Isso substitui os exercícios já cadastrados nos dias que a IA preencher. Dias que você já montou à mão fora desse número continuam intactos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Gerar',
          onPress: async () => {
            setIsGenerating(true);
            try {
              await onGenerate({ level, goal: goal.trim() || undefined, daysPerWeek: days, equipmentNotes: equipmentNotes.trim() || undefined });
              setExpanded(false);
              showAlert('Treino gerado!', 'Seu plano semanal foi montado pela IA. Dá pra ajustar qualquer exercício depois.');
            } catch {
              showAlert('Não foi possível gerar o treino agora. Tente de novo em instantes.');
            } finally {
              setIsGenerating(false);
            }
          },
        },
      ]
    );
  };

  if (!expanded) {
    return (
      <Pressable style={styles.aiCollapsed} onPress={() => setExpanded(true)}>
        <View style={styles.aiIconWrap}>
          <Feather name="cpu" size={18} color={colors.ignition} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.aiTitle}>Maverick Coach IA</Text>
          <Text style={styles.aiSubtitle}>
            {plan?.level
              ? `Treino gerado pra nível ${LEVEL_OPTIONS.find((o) => o.value === plan.level)?.label.toLowerCase()} · toque pra gerar de novo`
              : 'Deixe a IA montar seu treino semanal do zero'}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.steel} />
      </Pressable>
    );
  }

  return (
    <View style={styles.aiCard}>
      <Text style={styles.aiTitle}>Maverick Coach IA</Text>
      <Text style={styles.aiHint}>Diz seu nível e a IA monta um treino completo pra semana — a carga você mesmo registra ao treinar.</Text>

      <Text style={styles.aiFieldLabel}>Nível</Text>
      <View style={styles.levelRow}>
        {LEVEL_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => setLevel(opt.value)}
            style={[styles.levelPill, level === opt.value && styles.levelPillSelected]}
          >
            <Text style={[styles.levelPillText, level === opt.value && styles.levelPillTextSelected]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      <TextField label="Objetivo (opcional)" value={goal} onChangeText={setGoal} placeholder="Ex: hipertrofia, emagrecimento" />
      <TextField
        label="Dias de treino por semana"
        value={daysPerWeek}
        onChangeText={setDaysPerWeek}
        keyboardType="number-pad"
        placeholder="3"
      />
      <TextField
        label="Equipamento (opcional)"
        value={equipmentNotes}
        onChangeText={setEquipmentNotes}
        placeholder="Ex: só peso do corpo, halteres em casa"
      />

      <Button label="Gerar plano" onPress={handleGenerate} loading={isGenerating} style={{ marginTop: spacing.xs }} />
      <Button label="Cancelar" variant="ghost" onPress={() => setExpanded(false)} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

const VOLUME_TIER_COLORS: Record<string, string> = {
  baixo: colors.warning,
  moderado: colors.success,
  alto: colors.warning,
};

// Volume semanal por grupo muscular — ver src/lib/muscleVolume.ts pro
// raciocínio completo (séries de trabalho, não tonelagem). Visível tanto
// pro atleta quanto pro treinador vinculado (RLS de workout_logs já cobre
// os dois casos) — é leitura, não ação, então não precisa de canEditPlan.
function MuscleVolumeCard({ athleteUserId }: { athleteUserId: string }) {
  const [entries, setEntries] = useState<LoggedSetEntry[] | null>(null);

  useEffect(() => {
    let active = true;
    listRecentLoggedSets(athleteUserId)
      .then((data) => active && setEntries(data))
      .catch(() => active && setEntries([]));
    return () => {
      active = false;
    };
  }, [athleteUserId]);

  if (entries == null || entries.length === 0) return null;

  const weeks = weeklyVolumeByMuscleGroup(entries);
  const { thisWeek } = currentAndPreviousWeek(weeks);
  if (!thisWeek) return null;

  const rows = Object.entries(thisWeek.setsByMuscle).sort((a, b) => b[1] - a[1]);

  return (
    <View style={styles.volumeCard}>
      <Text style={styles.setLoggerTitle}>VOLUME ESTA SEMANA (SÉRIES POR GRUPO)</Text>
      {rows.map(([muscle, sets]) => {
        const tier = volumeTier(sets);
        return (
          <View key={muscle} style={styles.volumeRow}>
            <Text style={styles.volumeMuscle}>{muscle}</Text>
            <Text style={styles.volumeSets}>{sets} séries</Text>
            <Text style={[styles.volumeTierText, { color: VOLUME_TIER_COLORS[tier] }]}>{VOLUME_TIER_LABELS[tier]}</Text>
          </View>
        );
      })}
    </View>
  );
}

// Sugestão de progressão de carga — ver src/lib/progressiveOverload.ts.
// Busca as séries da última vez que o atleta fez ESSE exercício (antes de
// hoje) e compara com a faixa de reps do plano. `null` enquanto carrega
// ou quando não há histórico ainda (não mostra nada em vez de "sem_dado"
// logo de cara, pra não poluir a primeira vez que o exercício é feito).
function ProgressionHint({ exerciseId, muscleGroup, targetReps }: { exerciseId: string; muscleGroup: string | null; targetReps: string | null }) {
  const { user } = useAuth();
  const [suggestion, setSuggestion] = useState<OverloadSuggestion | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getLastCompletedSets(user.id, exerciseId, todayIsoDate())
      .then((lastSets) => {
        if (!active) return;
        if (lastSets.length === 0) return; // primeira vez com esse exercício — nada pra sugerir ainda
        setSuggestion(suggestProgression(lastSets, parseRepsTarget(targetReps), muscleGroup));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, exerciseId, muscleGroup, targetReps]);

  if (!suggestion || suggestion.action === 'sem_dado') return null;

  const color = suggestion.action === 'aumentar' ? colors.success : suggestion.action === 'reduzir' ? colors.danger : colors.steel;
  return (
    <View style={styles.progressionHint}>
      <Feather
        name={suggestion.action === 'aumentar' ? 'trending-up' : suggestion.action === 'reduzir' ? 'trending-down' : 'minus'}
        size={14}
        color={color}
      />
      <Text style={[styles.progressionHintText, { color }]}>{suggestion.message}</Text>
    </View>
  );
}

function DayDetail({
  day,
  exercises,
  isLoading,
  canEditPlan,
  isAthleteViewingSelf,
  isDone,
  logId,
  onToggleDone,
  onDayUpdated,
  onExercisesChanged,
}: {
  day: WorkoutPlanDay;
  exercises: WorkoutPlanExercise[];
  isLoading: boolean;
  canEditPlan: boolean;
  isAthleteViewingSelf: boolean;
  isDone: boolean;
  logId: string | null;
  onToggleDone: () => void;
  onDayUpdated: (patch: { label?: string; isRestDay?: boolean }) => void;
  onExercisesChanged: () => void;
}) {
  const [labelDraft, setLabelDraft] = useState(day.label);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setLabelDraft(day.label);
  }, [day.id, day.label]);

  return (
    <View style={styles.dayCard}>
      {canEditPlan ? (
        <TextField
          label="Nome do treino do dia"
          value={labelDraft}
          onChangeText={setLabelDraft}
          onBlur={() => labelDraft !== day.label && onDayUpdated({ label: labelDraft })}
          placeholder="Ex: Peito e Tríceps"
        />
      ) : (
        <Text style={styles.dayTitle}>{day.label || dayOfWeekName(day.dayOfWeek)}</Text>
      )}

      {canEditPlan && (
        <Pressable onPress={() => onDayUpdated({ isRestDay: !day.isRestDay })} style={styles.restToggle}>
          <Feather name={day.isRestDay ? 'check-square' : 'square'} size={16} color={colors.textMuted} />
          <Text style={styles.restToggleText}>Dia de descanso</Text>
        </Pressable>
      )}

      {day.isRestDay ? (
        <Text style={styles.emptyText}>Dia de descanso — sem exercícios planejados.</Text>
      ) : isLoading ? (
        <Text style={styles.emptyText}>Carregando exercícios…</Text>
      ) : exercises.length === 0 ? (
        <Text style={styles.emptyText}>
          {canEditPlan ? 'Nenhum exercício ainda — adicione abaixo.' : 'Nenhum exercício planejado pra esse dia.'}
        </Text>
      ) : (
        exercises.map((pe) => (
          <ExerciseRow
            key={pe.id}
            planExercise={pe}
            canEditPlan={canEditPlan}
            canLog={isAthleteViewingSelf && !!logId}
            logId={logId}
            onRemoved={onExercisesChanged}
          />
        ))
      )}

      {!isAthleteViewingSelf ? null : (
        <Button
          label={isDone ? 'Desmarcar treino de hoje' : 'Marcar treino como concluído'}
          variant={isDone ? 'ghost' : 'primary'}
          onPress={onToggleDone}
          style={{ marginTop: spacing.md }}
        />
      )}

      {canEditPlan && !day.isRestDay && (
        <>
          {showPicker ? (
            <AddExerciseForm
              dayId={day.id}
              sortOrder={exercises.length}
              onDone={() => {
                setShowPicker(false);
                onExercisesChanged();
              }}
              onCancel={() => setShowPicker(false)}
            />
          ) : (
            <Button label="Adicionar exercício" variant="ghost" onPress={() => setShowPicker(true)} style={{ marginTop: spacing.md }} />
          )}
        </>
      )}
    </View>
  );
}

function ExerciseRow({
  planExercise,
  canEditPlan,
  canLog,
  logId,
  onRemoved,
}: {
  planExercise: WorkoutPlanExercise;
  canEditPlan: boolean;
  canLog: boolean;
  logId: string | null;
  onRemoved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { exercise } = planExercise;

  const handleLongPress = () => {
    if (!canEditPlan) return;
    showAlert('Remover exercício?', `Remove "${exercise.name}" do plano desse dia.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await removeExerciseFromDay(planExercise.id);
        onRemoved();
      } },
    ]);
  };

  return (
    <View style={styles.exerciseCard}>
      <Pressable onPress={() => setExpanded((v) => !v)} onLongPress={handleLongPress} style={styles.exerciseHeader}>
        {exercise.photoUrl ? (
          <Image source={{ uri: exercise.photoUrl }} style={styles.exerciseThumb} />
        ) : (
          <View style={[styles.exerciseThumb, styles.exerciseThumbPlaceholder]}>
            <Feather name="activity" size={18} color={colors.steel} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <Text style={styles.exerciseMeta}>
            {exercise.muscleGroup ? `${exercise.muscleGroup} · ` : ''}
            {planExercise.sets ?? '—'}x{planExercise.reps ?? '—'}
          </Text>
        </View>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.steel} />
      </Pressable>

      {expanded && (
        <View style={styles.exerciseBody}>
          {exercise.description ? <Text style={styles.exerciseDescription}>{exercise.description}</Text> : null}
          {exercise.videoUrl ? (
            <Pressable onPress={() => Linking.openURL(exercise.videoUrl!)} style={styles.videoLink}>
              <Feather name="play-circle" size={16} color={colors.ignition} />
              <Text style={styles.videoLinkText}>Ver vídeo de execução</Text>
            </Pressable>
          ) : null}
          {planExercise.notes ? <Text style={styles.exerciseDescription}>Obs: {planExercise.notes}</Text> : null}

          {canLog && logId ? (
            <>
              <ProgressionHint exerciseId={exercise.id} muscleGroup={exercise.muscleGroup} targetReps={planExercise.reps} />
              <SetLogger logId={logId} exerciseId={exercise.id} defaultSets={planExercise.sets ?? 3} />
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

function SetLogger({ logId, exerciseId, defaultSets }: { logId: string; exerciseId: string; defaultSets: number }) {
  const [sets, setSets] = useState<SetEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    listLogSets(logId, exerciseId)
      .then((existing) => {
        if (!active) return;
        setSets(
          existing.length > 0
            ? existing
            : Array.from({ length: defaultSets }, (_, i) => ({ setNumber: i + 1, repsDone: null, weightKg: null, rpe: null }))
        );
      })
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [logId, exerciseId, defaultSets]);

  const updateSet = (index: number, patch: Partial<SetEntry>) => {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSet = () => {
    setSets((prev) => [...prev, { setNumber: prev.length + 1, repsDone: null, weightKg: null, rpe: null }]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveLogSets(logId, exerciseId, sets);
    } catch {
      showAlert('Não foi possível salvar as séries.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <Text style={styles.emptyText}>Carregando séries…</Text>;

  return (
    <View style={styles.setLogger}>
      <Text style={styles.setLoggerTitle}>SÉRIES</Text>
      {sets.map((s, i) => (
        <View key={i} style={styles.setRow}>
          <Text style={styles.setNumber}>{s.setNumber}ª</Text>
          <TextField
            label=""
            value={s.repsDone?.toString() ?? ''}
            onChangeText={(v) => updateSet(i, { repsDone: v ? Number(v) : null })}
            keyboardType="number-pad"
            placeholder="reps"
            style={styles.setInput}
          />
          <TextField
            label=""
            value={s.weightKg?.toString() ?? ''}
            onChangeText={(v) => updateSet(i, { weightKg: v ? Number(v.replace(',', '.')) : null })}
            keyboardType="decimal-pad"
            placeholder="kg"
            style={styles.setInput}
          />
          <TextField
            label=""
            value={s.rpe?.toString() ?? ''}
            onChangeText={(v) => updateSet(i, { rpe: v ? Number(v.replace(',', '.')) : null })}
            keyboardType="decimal-pad"
            placeholder="RPE"
            style={styles.setInput}
          />
        </View>
      ))}
      <View style={styles.setLoggerActions}>
        <Button label="+ série" variant="ghost" onPress={addSet} style={styles.smallButton} />
        <Button label="Salvar" onPress={handleSave} loading={isSaving} style={styles.smallButton} />
      </View>
    </View>
  );
}

function AddExerciseForm({
  dayId,
  sortOrder,
  onDone,
  onCancel,
}: {
  dayId: string;
  sortOrder: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [isSaving, setIsSaving] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    listExercises().then(setCatalog).catch(() => showAlert('Não foi possível carregar o catálogo de exercícios.'));
  }, []);

  const filtered = useMemo(
    () => catalog.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())),
    [catalog, query]
  );

  const handleAddSelected = async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      await addExerciseToDay(dayId, selected.id, { sets: Number(sets) || undefined, reps: reps || undefined }, sortOrder);
      onDone();
    } catch {
      showAlert('Não foi possível adicionar o exercício.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!user || !newName.trim()) return;
    setIsSaving(true);
    try {
      const created = await addExercise(user.id, { name: newName });
      await addExerciseToDay(dayId, created.id, { sets: Number(sets) || undefined, reps: reps || undefined }, sortOrder);
      onDone();
    } catch {
      showAlert('Não foi possível criar o exercício.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.addForm}>
      <TextField label="Buscar exercício" value={query} onChangeText={setQuery} placeholder="Ex: agachamento" />
      <ScrollView style={styles.catalogList} nestedScrollEnabled>
        {filtered.map((ex) => (
          <Pressable
            key={ex.id}
            onPress={() => setSelected(ex)}
            style={[styles.catalogRow, selected?.id === ex.id && styles.catalogRowSelected]}
          >
            <Text style={styles.catalogRowText}>{ex.name}</Text>
            {ex.muscleGroup ? <Text style={styles.catalogRowMeta}>{ex.muscleGroup}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.setRow}>
        <TextField label="Séries" value={sets} onChangeText={setSets} keyboardType="number-pad" style={styles.setInput} />
        <TextField label="Reps" value={reps} onChangeText={setReps} placeholder="8-12" style={styles.setInput} />
      </View>

      {selected ? (
        <Button label={`Adicionar "${selected.name}"`} onPress={handleAddSelected} loading={isSaving} />
      ) : (
        <>
          <Text style={styles.emptyText}>Não achou? Cadastre um novo:</Text>
          <TextField label="Nome do exercício novo" value={newName} onChangeText={setNewName} placeholder="Ex: Elevação lateral" />
          <Button label="Criar e adicionar" onPress={handleCreateAndAdd} loading={isSaving} disabled={!newName.trim()} />
        </>
      )}
      <Button label="Cancelar" variant="ghost" onPress={onCancel} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

// Exportado pra permitir anexar foto/vídeo a um exercício a partir de
// qualquer tela (usado no catálogo de exercícios, se necessário no futuro).
export async function pickAndUploadExercisePhoto(exerciseId: string): Promise<void> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Permissão negada.');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || !result.assets?.[0]) return;
  const asset = result.assets[0];
  await uploadExercisePhoto(exerciseId, asset.uri, asset.mimeType ?? 'image/jpeg');
}

export { setExerciseVideoUrl };

const styles = StyleSheet.create({
  aiCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  aiCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.ignitionMuted,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  aiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.ignitionMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  aiTitle: { fontFamily: typography.bodySemiBold, fontSize: 15, color: colors.textPrimary },
  aiSubtitle: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  aiHint: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md, lineHeight: 17 },
  aiFieldLabel: { fontFamily: typography.mono, fontSize: 10, color: colors.steel, letterSpacing: 1.5, marginBottom: spacing.xs },
  levelRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  levelPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  levelPillSelected: { borderColor: colors.ignition, backgroundColor: colors.ignitionMuted },
  levelPillText: { fontFamily: typography.bodyMedium, fontSize: 12, color: colors.textMuted },
  levelPillTextSelected: { color: colors.ignition },
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
  dayChipRest: { borderStyle: 'dashed' },
  dayChipName: { fontFamily: typography.mono, fontSize: 11, color: colors.textMuted, letterSpacing: 1 },
  dayChipNameSelected: { color: colors.ignition },
  dayChipDate: { fontFamily: typography.body, fontSize: 10, color: colors.steel, marginTop: 2 },
  dayCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  dayTitle: { fontFamily: typography.bodySemiBold, fontSize: 17, color: colors.textPrimary, marginBottom: spacing.sm },
  restToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  restToggleText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, marginLeft: 6 },
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  pendingNote: { fontFamily: typography.body, fontSize: 11, color: colors.warning, marginBottom: spacing.md },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm + 4, gap: spacing.sm },
  exerciseThumb: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated },
  exerciseThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  exerciseName: { fontFamily: typography.bodyMedium, fontSize: 14, color: colors.textPrimary },
  exerciseMeta: { fontFamily: typography.mono, fontSize: 11, color: colors.steel, marginTop: 2 },
  exerciseBody: { paddingHorizontal: spacing.sm + 4, paddingBottom: spacing.sm + 4 },
  exerciseDescription: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs, lineHeight: 17 },
  videoLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  videoLinkText: { fontFamily: typography.bodyMedium, fontSize: 12, color: colors.ignition, marginLeft: 6 },
  setLogger: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  setLoggerTitle: { fontFamily: typography.mono, fontSize: 10, color: colors.steel, letterSpacing: 1.5, marginBottom: spacing.xs },
  volumeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  volumeRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: spacing.sm },
  volumeMuscle: { fontFamily: typography.bodyMedium, fontSize: 13, color: colors.textPrimary, flex: 1 },
  volumeSets: { fontFamily: typography.mono, fontSize: 11, color: colors.textMuted },
  volumeTierText: { fontFamily: typography.body, fontSize: 11 },
  progressionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  progressionHintText: { fontFamily: typography.body, fontSize: 12, flex: 1, lineHeight: 17 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  setNumber: { fontFamily: typography.mono, fontSize: 12, color: colors.textMuted, width: 24 },
  setInput: { flex: 1, marginBottom: spacing.xs },
  setLoggerActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  smallButton: { flex: 1, paddingVertical: spacing.sm },
  addForm: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  catalogList: { maxHeight: 160, marginBottom: spacing.sm },
  catalogRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  catalogRowSelected: { backgroundColor: colors.ignitionMuted },
  catalogRowText: { fontFamily: typography.body, fontSize: 13, color: colors.textPrimary },
  catalogRowMeta: { fontFamily: typography.mono, fontSize: 10, color: colors.steel },
});
