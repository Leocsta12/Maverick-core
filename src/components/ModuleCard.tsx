import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  locked?: boolean;
  onPress?: () => void;
};

export function ModuleCard({ icon, title, subtitle, locked, onPress }: Props) {
  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      style={({ pressed }) => [styles.card, locked && styles.cardLocked, pressed && !locked && { opacity: 0.85 }]}
    >
      <View style={[styles.iconWrap, locked && { backgroundColor: colors.surfaceElevated }]}>
        <Feather name={icon} size={20} color={locked ? colors.steel : colors.ignition} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {locked ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>EM BREVE</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardLocked: { borderStyle: 'dashed', opacity: 0.7 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.ignitionMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontFamily: typography.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  subtitle: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badge: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: typography.mono, fontSize: 9, color: colors.steel, letterSpacing: 1 },
});
