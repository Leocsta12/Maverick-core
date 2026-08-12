import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.ghost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.bg : colors.ignition} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelGhost]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.ignition },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  label: { fontFamily: typography.bodySemiBold, fontSize: 15 },
  labelPrimary: { color: colors.bg },
  labelGhost: { color: colors.textPrimary },
});
