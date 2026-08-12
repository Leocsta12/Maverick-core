import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/tokens';
import { formatCachedAt } from '../lib/offlineCache';

/** Aviso padrão pros módulos com cache offline (Fase 1: só leitura — ver src/lib/offlineCache.ts). */
export function OfflineBanner({ cachedAt }: { cachedAt: string | null }) {
  if (!cachedAt) return null;
  return (
    <View style={styles.banner}>
      <Feather name="wifi-off" size={13} color={colors.warning} />
      <Text style={styles.text}>Sem conexão agora — mostrando dados salvos às {formatCachedAt(cachedAt)}.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  text: { fontFamily: typography.body, fontSize: 11, color: colors.textMuted, marginLeft: 4, flex: 1 },
});
