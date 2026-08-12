import { ScrollView, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { WorkoutWeek } from '../../src/components/WorkoutWeek';

export default function Treinos() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

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
      <Text style={styles.eyebrow}>TREINOS</Text>
      <Text style={styles.title}>Sua semana</Text>

      <WorkoutWeek athleteUserId={user.id} canEditPlan />

      <Text style={styles.footnote}>
        Toque e segure num exercício pra removê-lo do dia. Fotos e vídeos de execução ficam salvos por
        exercício — adicione a foto ao cadastrar (em breve pela tela) ou peça pro seu treinador anexar.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.lg },
  footnote: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.steel,
    lineHeight: 16,
    marginTop: spacing.xl,
  },
});
