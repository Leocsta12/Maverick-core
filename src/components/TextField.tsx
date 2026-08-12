import { TextInput, View, Text, StyleSheet, TextInputProps } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = TextInputProps & { label: string; error?: string };

export function TextField({ label, error, style, ...rest }: Props) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.steel}
        style={[styles.input, error ? { borderColor: colors.danger } : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    color: colors.textPrimary,
    fontFamily: typography.body,
    fontSize: 15,
  },
  error: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: spacing.xs,
  },
});
