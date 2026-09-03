import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../theme/tokens';
import { TextField } from './TextField';
import { Button } from './Button';
import { showAlert } from '../lib/alert';
import {
  addEnduranceSession,
  ENDURANCE_SPORT_LABELS,
  ENDURANCE_WORKOUT_TYPE_LABELS,
  groupSessionsByDay,
  listEnduranceSessions,
  removeEnduranceSession,
  summarizeSession,
  updateEnduranceSession,
  type EnduranceSession,
  type EnduranceSport,
  type EnduranceWorkoutType,
  type NewEnduranceSession,
} from '../lib/endurancePlan';
import { dayOfWeekName } from '../lib/workouts';

const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6];
const SPORTS: EnduranceSport[] = ['corrida', 'bike', 'natacao', 'outro'];
const WORKOUT_TYPES: EnduranceWorkoutType[] = [
  'rodagem',
  'longao',
  'intervalado',
  'tempo_run',
  'fartlek',
  'regenerativo',
  'prova',
  'folga',
];

const EMPTY_DRAFT: NewEnduranceSession = { dayOfWeek: 0, sport: 'corrida', workoutType: 'rodagem' };

type Props = { athleteUserId: string; canEdit: boolean };

export function EnduranceWeek({ athleteUserId, canEdit }: Props) {
  const [sessions, setSessions] = useState<EnduranceSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewEnduranceSession>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(() => {
    setIsLoading(true);
    listEnduranceSessions(athleteUserId)
      .then(setSessions)
      .catch(() => showAlert('Não foi possível carregar o plano de endurance.'))
      .finally(() => setIsLoading(false));
  }, [athleteUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = groupSessionsByDay(sessions);

  const startAdd = (dayOfWeek: number) => {
    setDraft({ ...EMPTY_DRAFT, dayOfWeek });
    setEditingId(null);
    setOpenDay(dayOfWeek);
  };

  const startEdit = (session: EnduranceSession) => {
    setDraft({
      dayOfWeek: session.dayOfWeek,
      sport: session.sport,
      workoutType: session.workoutType,
      targetZone: session.targetZone,
      targetPace: session.targetPace,
      plannedDistanceKm: session.plannedDistanceKm,
      plannedDurationMin: session.plannedDurationMin,
      structureNotes: session.structureNotes,
    });
    setEditingId(session.id);
    setOpenDay(session.dayOfWeek);
  };

  const cancelForm = () => {
    setOpenDay(null);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (editingId) {
        await updateEnduranceSession(editingId, draft);
      } else {
        await addEnduranceSession(athleteUserId, draft);
      }
      cancelForm();
      load();
    } catch {
      showAlert('Não foi possível salvar esse treino agora.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (session: EnduranceSession) => {
    showAlert('Remover treino?', `${ENDURANCE_WORKOUT_TYPE_LABELS[session.workoutType]} — ${dayOfWeekName(session.dayOfWeek)}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await removeEnduranceSession(session.id);
          load();
        },
      },
    ]);
  };

  if (isLoading) return <Text style={styles.emptyText}>Carregando plano de endurance…</Text>;

  return (
    <View>
      {DAY_ORDER.map((day) => {
        const daySessions = byDay[day];
        const isFormOpen = openDay === day;
        return (
          <View key={day} style={styles.dayBlock}>
            <View style={styles.dayHeaderRow}>
              <Text style={styles.dayLabel}>{dayOfWeekName(day)}</Text>
              {canEdit && !isFormOpen && (
                <Pressable onPress={() => startAdd(day)} hitSlop={8}>
                  <Feather name="plus-circle" size={18} color={colors.ignition} />
                </Pressable>
              )}
            </View>

            {daySessions.length === 0 && !isFormOpen ? (
              <Text style={styles.restText}>—</Text>
            ) : (
              daySessions.map((session) => (
                <Pressable
                  key={session.id}
                  onPress={() => canEdit && startEdit(session)}
                  onLongPress={() => canEdit && handleDelete(session)}
                  style={styles.sessionCard}
                >
                  <View style={[styles.sportDot, styles[`sportDot_${session.sport ?? 'outro'}`]]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionType}>{ENDURANCE_WORKOUT_TYPE_LABELS[session.workoutType]}</Text>
                    {summarizeSession(session) ? <Text style={styles.sessionSummary}>{summarizeSession(session)}</Text> : null}
                    {session.structureNotes ? <Text style={styles.sessionNotes}>{session.structureNotes}</Text> : null}
                  </View>
                </Pressable>
              ))
            )}

            {isFormOpen && (
              <View style={styles.form}>
                <Text style={styles.fieldLabel}>Esporte</Text>
                <View style={styles.chipsRow}>
                  {SPORTS.map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => setDraft((d) => ({ ...d, sport: s }))}
                      style={[styles.chip, draft.sport === s && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, draft.sport === s && styles.chipTextActive]}>{ENDURANCE_SPORT_LABELS[s]}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Tipo de treino</Text>
                <View style={styles.chipsRow}>
                  {WORKOUT_TYPES.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => setDraft((d) => ({ ...d, workoutType: t }))}
                      style={[styles.chip, draft.workoutType === t && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, draft.workoutType === t && styles.chipTextActive]}>
                        {ENDURANCE_WORKOUT_TYPE_LABELS[t]}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {draft.workoutType !== 'folga' && (
                  <>
                    <Text style={styles.fieldLabel}>Zona de FC alvo</Text>
                    <View style={styles.chipsRow}>
                      {[1, 2, 3, 4, 5].map((z) => (
                        <Pressable
                          key={z}
                          onPress={() => setDraft((d) => ({ ...d, targetZone: d.targetZone === z ? null : z }))}
                          style={[styles.chip, draft.targetZone === z && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, draft.targetZone === z && styles.chipTextActive]}>Z{z}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.row2}>
                      <TextField
                        label="Distância (km)"
                        value={draft.plannedDistanceKm?.toString() ?? ''}
                        onChangeText={(v) => setDraft((d) => ({ ...d, plannedDistanceKm: v ? Number(v.replace(',', '.')) : null }))}
                        keyboardType="decimal-pad"
                        placeholder="8"
                        style={styles.halfInput}
                      />
                      <TextField
                        label="Duração (min)"
                        value={draft.plannedDurationMin?.toString() ?? ''}
                        onChangeText={(v) => setDraft((d) => ({ ...d, plannedDurationMin: v ? Number(v) : null }))}
                        keyboardType="number-pad"
                        placeholder="45"
                        style={styles.halfInput}
                      />
                    </View>

                    <TextField
                      label="Pace alvo (opcional)"
                      value={draft.targetPace ?? ''}
                      onChangeText={(v) => setDraft((d) => ({ ...d, targetPace: v }))}
                      placeholder="ex: 5:30/km"
                    />

                    <TextField
                      label="Estrutura (opcional)"
                      value={draft.structureNotes ?? ''}
                      onChangeText={(v) => setDraft((d) => ({ ...d, structureNotes: v }))}
                      placeholder="ex: 6x800m Z4 / 400m trote entre séries"
                      multiline
                      style={{ minHeight: 60, textAlignVertical: 'top' }}
                    />
                  </>
                )}

                <View style={styles.formActions}>
                  <Button label="Cancelar" variant="ghost" onPress={cancelForm} style={{ flex: 1, marginRight: spacing.sm }} />
                  <Button label="Salvar" onPress={handleSave} loading={isSaving} style={{ flex: 1 }} />
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted },
  dayBlock: { marginBottom: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  dayLabel: { fontFamily: typography.bodySemiBold, fontSize: 13, color: colors.textPrimary },
  restText: { fontFamily: typography.body, fontSize: 12, color: colors.steel },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs,
  },
  sportDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  sportDot_corrida: { backgroundColor: colors.ignition },
  sportDot_bike: { backgroundColor: colors.success },
  sportDot_natacao: { backgroundColor: '#4EA1D3' },
  sportDot_outro: { backgroundColor: colors.steel },
  sessionType: { fontFamily: typography.bodyMedium, fontSize: 13, color: colors.textPrimary },
  sessionSummary: { fontFamily: typography.mono, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  sessionNotes: { fontFamily: typography.body, fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 15 },
  form: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginTop: spacing.xs,
  },
  fieldLabel: { fontFamily: typography.bodyMedium, fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs, marginTop: spacing.xs },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.ignitionMuted, borderColor: colors.ignition },
  chipText: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted },
  chipTextActive: { color: colors.ignition, fontFamily: typography.bodyMedium },
  row2: { flexDirection: 'row', gap: spacing.sm },
  halfInput: { flex: 1 },
  formActions: { flexDirection: 'row', marginTop: spacing.xs },
});
