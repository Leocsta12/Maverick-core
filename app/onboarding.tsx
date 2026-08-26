import { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, radius } from '../src/theme/tokens';
import { Button } from '../src/components/Button';
import { markOnboardingSeen } from '../src/lib/onboarding';

/**
 * Tour de primeiro acesso — explica os sinais que o app calcula sozinho
 * (Prontidão, Carga/zonas, Volume/progressão, Nutrição/taper) ANTES do
 * atleta esbarrar neles sem contexto nenhum. Um usuário novo abrindo
 * Health pela primeira vez não tem como adivinhar o que "ACWR" ou
 * "Prontidão de treino" significam — isso aqui é a explicação de uma vez,
 * com o "porquê" de cada número, não só o nome dele.
 */

type Slide = {
  icon: keyof typeof Feather.glyphMap;
  eyebrow: string;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: 'zap',
    eyebrow: 'BEM-VINDO',
    title: 'Seu treinador de bolso',
    body: 'O Maverick não é só um registro de treino — ele lê seus dados de sono, treino e nutrição e te diz o que fazer com eles, como um treinador de força e endurance de verdade faria. Leva 1 minuto pra entender os números que você vai ver por aí.',
  },
  {
    icon: 'activity',
    eyebrow: 'HEALTH',
    title: 'Prontidão de treino',
    body: 'Todo dia, um número de 0 a 100 combina seu sono, a carga recente das suas atividades e o esforço (RPE) da sua última musculação — e te diz se hoje é dia de ir com tudo ou segurar um pouco.',
  },
  {
    icon: 'trending-up',
    eyebrow: 'HEALTH · STRAVA',
    title: 'Carga e zonas de FC',
    body: 'Cada corrida, pedal ou nado vira uma zona de intensidade (Z1 a Z5) e entra na sua carga semanal. Quando a carga sobe rápido demais pro seu corpo acompanhar, a gente avisa antes de virar lesão — e sugere quando programar uma semana mais leve.',
  },
  {
    icon: 'bar-chart-2',
    eyebrow: 'TREINOS',
    title: 'Volume e progressão',
    body: 'Acompanhamos quantas séries cada grupo muscular fez na semana, e sugerimos quando subir carga com base nas reps que você bateu e no RPE que você registrou — a mesma lógica de dupla progressão que um treinador usaria.',
  },
  {
    icon: 'zap',
    eyebrow: 'NUTRITION',
    title: 'Nutrição que acompanha o treino',
    body: 'Sua meta de carboidrato sugerida muda com o volume de treino do dia — mais em dias pesados, menos em dias de descanso. E se você marcar uma prova, a gente já calcula em que fase do taper você está.',
  },
  {
    icon: 'flag',
    eyebrow: 'PRONTO',
    title: 'Bora começar',
    body: 'Registre seu sono de hoje, monte seu treino da semana, e deixe o Maverick fazer o resto das contas.',
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  const goToDashboard = () => {
    markOnboardingSeen().catch(() => {});
    router.replace('/dashboard');
  };

  const handleNext = () => {
    if (isLast) {
      goToDashboard();
      return;
    }
    scrollRef.current?.scrollTo({ x: (index + 1) * SCREEN_WIDTH, animated: true });
  };

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setIndex(newIndex);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.skipRow, { paddingTop: insets.top + spacing.sm }]}>
        {!isLast ? (
          <Pressable onPress={goToDashboard} hitSlop={12}>
            <Text style={styles.skipText}>Pular</Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
            <View style={styles.iconWrap}>
              <Feather name={slide.icon} size={28} color={colors.ignition} />
            </View>
            <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Button label={isLast ? 'Vamos treinar' : 'Próximo'} onPress={handleNext} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    minHeight: 28,
  },
  skipText: { fontFamily: typography.bodyMedium, fontSize: 14, color: colors.textMuted },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.ignitionMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2, marginBottom: spacing.sm },
  title: {
    fontFamily: typography.display,
    fontSize: 26,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: typography.body,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: { backgroundColor: colors.ignition, width: 20 },
});
