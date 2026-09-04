import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Vibration } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/tokens';

/**
 * Maverick Descanso — temporizador de intervalo entre séries/exercícios,
 * direto na tela de registro de treino (SetLogger, em WorkoutWeek.tsx).
 * Sem depender de nenhum módulo nativo novo (nada de expo-av/expo-haptics)
 * de propósito — usar a Vibration API do próprio react-native evita mais
 * um ciclo de build nativo só pra isso (ver histórico de dor de cabeça
 * com dependência nativa nesse projeto).
 */

const PRESETS_SEC = [60, 90, 120, 180];

export function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function RestTimer({ onClose }: { onClose: () => void }) {
  const [durationSec, setDurationSec] = useState<number | null>(null); // null = ainda escolhendo o tempo
  const [remaining, setRemaining] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const hasVibratedRef = useRef(false);

  useEffect(() => {
    if (durationSec == null || isPaused || remaining <= 0) return;
    const id = setInterval(() => setRemaining((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(id);
  }, [durationSec, isPaused, remaining]);

  useEffect(() => {
    if (durationSec != null && remaining === 0 && !hasVibratedRef.current) {
      hasVibratedRef.current = true;
      if (Platform.OS !== 'web') Vibration.vibrate([0, 300, 100, 300]);
    }
  }, [durationSec, remaining]);

  const start = (sec: number) => {
    hasVibratedRef.current = false;
    setDurationSec(sec);
    setRemaining(sec);
    setIsPaused(false);
  };

  const isDone = durationSec != null && remaining === 0;

  if (durationSec == null) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>DESCANSO</Text>
        <View style={styles.row}>
          {PRESETS_SEC.map((p) => (
            <Pressable key={p} onPress={() => start(p)} style={styles.presetChip}>
              <Text style={styles.presetChipText}>{p}s</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <Feather name="x" size={16} color={colors.steel} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, isDone && styles.wrapDone]}>
      <Text style={[styles.label, isDone && styles.labelDone]}>{isDone ? 'DESCANSO ACABOU' : 'DESCANSO'}</Text>
      <View style={styles.row}>
        <Text style={[styles.timeText, isDone && styles.timeTextDone]}>{formatMMSS(remaining)}</Text>
        <View style={styles.controlsRow}>
          {!isDone && (
            <Pressable onPress={() => setIsPaused((p) => !p)} hitSlop={8} style={styles.iconBtn}>
              <Feather name={isPaused ? 'play' : 'pause'} size={16} color={colors.textPrimary} />
            </Pressable>
          )}
          {!isDone && (
            <Pressable onPress={() => setRemaining((r) => r + 15)} hitSlop={8} style={styles.iconBtn}>
              <Text style={styles.plusText}>+15s</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} hitSlop={8} style={styles.iconBtn}>
            <Feather name="x" size={16} color={colors.steel} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  wrapDone: { borderColor: colors.ignition, backgroundColor: colors.ignitionMuted },
  label: { fontFamily: typography.mono, fontSize: 10, color: colors.steel, letterSpacing: 1.2, marginBottom: spacing.xs },
  labelDone: { color: colors.ignition },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  presetChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  presetChipText: { fontFamily: typography.bodyMedium, fontSize: 12, color: colors.textPrimary },
  closeBtn: { marginLeft: 'auto' },
  timeText: { fontFamily: typography.display, fontSize: 26, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  timeTextDone: { color: colors.ignition },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBtn: { alignItems: 'center', justifyContent: 'center' },
  plusText: { fontFamily: typography.bodyMedium, fontSize: 12, color: colors.textPrimary },
});
