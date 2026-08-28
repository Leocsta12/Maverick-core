import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { showAlert } from '../../src/lib/alert';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import {
  addPainEntry,
  COMMON_BODY_PARTS,
  deletePainEntry,
  listPainEntries,
  severityLabel,
  todayIsoDate,
  type PainEntry,
} from '../../src/lib/painLog';
import { listExercises, type Exercise } from '../../src/lib/workouts';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';

function formatDatePt(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

function severityColor(severity: number): string {
  if (severity <= 3) return colors.success;
  if (severity <= 6) return colors.warning;
  return colors.danger;
}

export default function Pain() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<PainEntry[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [bodyPart, setBodyPart] = useState('');
  const [severity, setSeverity] = useState(5);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    setIsLoading(true);
    Promise.all([listPainEntries(user.id), listExercises().catch(() => [])])
      .then(([e, ex]) => {
        setEntries(e);
        setExercises(ex);
      })
      .catch(() => showAlert('Não foi possível carregar seu histórico de dor/desconforto.'))
      .finally(() => setIsLoading(false));
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!user) return;
    if (!bodyPart.trim()) {
      showAlert('Descreva onde sentiu (ex: joelho, ombro, lombar).');
      return;
    }
    setIsSaving(true);
    try {
      await addPainEntry(user.id, { entryDate: todayIsoDate(), bodyPart, severity, exerciseId, notes });
      setBodyPart('');
      setSeverity(5);
      setExerciseId(null);
      setNotes('');
      load();
    } catch {
      showAlert('Não foi possível salvar o registro agora.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (entry: PainEntry) => {
    showAlert('Remover registro?', `${entry.bodyPart} — ${formatDatePt(entry.entryDate)}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await deletePainEntry(entry.id);
          load();
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
      <Text style={styles.eyebrow}>DOR / DESCONFORTO</Text>
      <Text style={styles.title}>Registrar agora</Text>
      <Text style={styles.subtitle}>
        Ajuda a validar se os alertas de carga estão funcionando de verdade — quanto mais cedo você registrar, mais
        fácil cruzar com o que estava acontecendo no treino.
      </Text>

      <TextField label="Onde você sentiu?" value={bodyPart} onChangeText={setBodyPart} placeholder="ex: joelho direito" />
      <View style={styles.chipsRow}>
        {COMMON_BODY_PARTS.map((part) => (
          <Pressable key={part} onPress={() => setBodyPart(part)} style={[styles.chip, bodyPart === part && styles.chipActive]}>
            <Text style={[styles.chipText, bodyPart === part && styles.chipTextActive]}>{part}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Intensidade: {severity} — {severityLabel(severity)}</Text>
      <View style={styles.severityRow}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            onPress={() => setSeverity(n)}
            style={[styles.severityDot, { borderColor: severityColor(n) }, severity === n && { backgroundColor: severityColor(n) }]}
          >
            <Text style={[styles.severityDotText, severity === n && { color: colors.bg }]}>{n}</Text>
          </Pressable>
        ))}
      </View>

      {exercises.length > 0 && (
        <>
          <Text style={styles.fieldLabel}>Ligado a algum exercício? (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              {exerciseId != null && (
                <Pressable onPress={() => setExerciseId(null)} style={[styles.chip, styles.chipActive]}>
                  <Text style={[styles.chipText, styles.chipTextActive]}>Limpar</Text>
                </Pressable>
              )}
              {exercises.map((ex) => (
                <Pressable
                  key={ex.id}
                  onPress={() => setExerciseId(ex.id === exerciseId ? null : ex.id)}
                  style={[styles.chip, exerciseId === ex.id && styles.chipActive]}
                >
                  <Text style={[styles.chipText, exerciseId === ex.id && styles.chipTextActive]}>{ex.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </>
      )}

      <TextField label="Notas (opcional)" value={notes} onChangeText={setNotes} placeholder="o que estava fazendo, quando começou…" multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />

      <Button label="Salvar registro" onPress={handleSave} loading={isSaving} />

      <Text style={styles.sectionTitle}>Histórico</Text>
      {isLoading ? (
        <Text style={styles.emptyText}>Carregando…</Text>
      ) : entries.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum registro ainda — melhor assim.</Text>
      ) : (
        <View style={styles.list}>
          {entries.map((entry, i) => (
            <Pressable
              key={entry.id}
              onLongPress={() => handleDelete(entry)}
              style={[styles.row, i === entries.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={[styles.severityBadge, { borderColor: severityColor(entry.severity) }]}>
                <Text style={[styles.severityBadgeText, { color: severityColor(entry.severity) }]}>{entry.severity}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {entry.bodyPart}
                  {entry.exerciseName ? ` · ${entry.exerciseName}` : ''}
                </Text>
                <Text style={styles.rowMeta}>
                  {severityLabel(entry.severity)} · {formatDatePt(entry.entryDate)}
                  {entry.notes ? ` · ${entry.notes}` : ''}
                </Text>
              </View>
              <Feather name="trash-2" size={14} color={colors.steel} />
            </Pressable>
          ))}
        </View>
      )}
      {entries.length > 0 && <Text style={styles.footnote}>Toque e segure num registro pra removê-lo.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4 },
  subtitle: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, marginTop: 6, marginBottom: spacing.lg, lineHeight: 18 },
  fieldLabel: { fontFamily: typography.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: -spacing.sm, marginBottom: spacing.md },
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
  severityRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.md },
  severityDot: {
    flex: 1,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityDotText: { fontFamily: typography.mono, fontSize: 12, color: colors.textPrimary },
  sectionTitle: {
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  severityBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityBadgeText: { fontFamily: typography.mono, fontSize: 12 },
  rowTitle: { fontFamily: typography.bodyMedium, fontSize: 13, color: colors.textPrimary },
  rowMeta: { fontFamily: typography.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  footnote: { fontFamily: typography.body, fontSize: 11, color: colors.steel, lineHeight: 16, marginTop: spacing.sm },
});
