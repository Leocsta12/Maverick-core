import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';

type Row = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  href: '/vision' | '/coach' | '/profile' | '/mission' | '/planner';
};

const ROWS: Row[] = [
  { icon: 'grid', title: 'Planner', subtitle: 'Treino, nutrição e recuperação da semana', href: '/planner' },
  { icon: 'check-square', title: 'Hábitos', subtitle: 'Checklist diário com sequência', href: '/mission' },
  { icon: 'camera', title: 'Vision', subtitle: 'Fotos de progresso e tendências', href: '/vision' },
  { icon: 'users', title: 'Coach', subtitle: 'Vínculo treinador ↔ atleta', href: '/coach' },
  { icon: 'user', title: 'Perfil', subtitle: 'Sua conta e preferências', href: '/profile' },
];

export default function Mais() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
    >
      <Text style={styles.eyebrow}>MAIS</Text>
      <Text style={styles.title}>{user?.name?.split(' ')[0] ?? 'Atleta'}</Text>

      <View style={styles.list}>
        {ROWS.map((row, i) => (
          <Pressable
            key={row.href}
            onPress={() => router.push(row.href)}
            style={({ pressed }) => [styles.row, i === ROWS.length - 1 && { borderBottomWidth: 0 }, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.iconWrap}>
              <Feather name={row.icon} size={18} color={colors.ignition} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.steel} />
          </Pressable>
        ))}
      </View>

      <Pressable onPress={signOut} style={({ pressed }) => [styles.signOutRow, pressed && { opacity: 0.85 }]}>
        <View style={[styles.iconWrap, styles.signOutIconWrap]}>
          <Feather name="log-out" size={18} color={colors.danger} />
        </View>
        <Text style={[styles.rowTitle, { color: colors.danger }]}>Sair</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.xl },
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.ignitionMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  rowTitle: { fontFamily: typography.bodySemiBold, fontSize: 15, color: colors.textPrimary },
  rowSubtitle: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutIconWrap: { backgroundColor: 'rgba(255, 92, 92, 0.14)' },
});
