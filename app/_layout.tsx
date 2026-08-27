import { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Slot, usePathname } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import * as Sentry from '@sentry/react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { colors, spacing, typography } from '../src/theme/tokens';
import { Button } from '../src/components/Button';
import { AlertHost } from '../src/lib/alert';
import { flushOfflineQueue } from '../src/lib/offlineSync';
import { identifyUser, initSentry, resetUser, trackScreenView } from '../src/lib/monitoring';
import { clearMyPushTokens, saveMyPushToken } from '../src/lib/notifications';

SplashScreen.preventAutoHideAsync().catch(() => {});

// O quanto antes possível, antes de qualquer outro módulo poder lançar um
// erro durante o boot — no-op se EXPO_PUBLIC_SENTRY_DSN não estiver
// configurado (ver src/lib/monitoring.ts).
initSentry();

// Tenta despachar qualquer registro/marcação que ficou pendente de uma
// sessão offline anterior assim que o app abre com sessão ativa — sem
// esperar a pessoa visitar Health ou Treinos de novo pra isso acontecer.
function OfflineSyncOnStart() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    flushOfflineQueue().catch(() => {});
  }, [user]);
  return null;
}

// Liga/desliga a identificação do usuário no Sentry/PostHog junto com o
// login — sem isso, os eventos de analytics ficariam todos anônimos, e um
// erro capturado não diria de quem era a conta.
function MonitoringOnAuthChange() {
  const { user } = useAuth();
  useEffect(() => {
    if (user) {
      identifyUser(user.id, { name: user.name });
    } else {
      resetUser();
    }
  }, [user]);
  return null;
}

// Pede permissão e registra o token de push assim que loga; remove o
// token ao deslogar (não faz sentido continuar recebendo avisos sobre a
// conta de quem já saiu). Guarda o último userId num ref porque, no
// momento em que `user` já virou null, não dá mais pra saber de quem era
// a sessão que acabou de encerrar.
function PushTokenOnAuthChange() {
  const { user } = useAuth();
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (user) {
      lastUserId.current = user.id;
      saveMyPushToken(user.id).catch(() => {});
    } else if (lastUserId.current) {
      clearMyPushTokens(lastUserId.current).catch(() => {});
      lastUserId.current = null;
    }
  }, [user]);

  return null;
}

// Um evento de "$pageview" por troca de rota — a métrica mais básica de
// analytics de produto (quais telas são visitadas, em que ordem).
function ScreenViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    trackScreenView(pathname);
  }, [pathname]);
  return null;
}

// Fallback do GlobalErrorBoundary — só aparece se algo travar o render de
// verdade (o erro já foi mandado pro Sentry antes desta tela aparecer).
function CrashFallback({ resetError }: { error: unknown; resetError: () => void }) {
  return (
    <View style={styles.crashWrap}>
      <Text style={styles.crashTitle}>Algo deu errado</Text>
      <Text style={styles.crashText}>
        Um erro inesperado travou a tela. Já foi registrado — tente de novo.
      </Text>
      <Button label="Tentar de novo" onPress={resetError} style={{ marginTop: spacing.lg }} />
    </View>
  );
}

function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_500Medium,
  });

  const hideSplash = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    hideSplash();
  }, [hideSplash]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Sentry.GlobalErrorBoundary fallback={CrashFallback}>
      <SafeAreaProvider>
        <AuthProvider>
          <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <StatusBar style="light" />
            <Slot />
            <AlertHost />
            <OfflineSyncOnStart />
            <MonitoringOnAuthChange />
            <PushTokenOnAuthChange />
            <ScreenViewTracker />
          </View>
        </AuthProvider>
      </SafeAreaProvider>
    </Sentry.GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  crashWrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  crashTitle: { fontFamily: typography.display, fontSize: 22, color: colors.textPrimary, marginBottom: spacing.sm },
  crashText: { fontFamily: typography.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});

// Sentry.wrap acrescenta profiling/instrumentação automática em volta da
// árvore inteira — funciona independente do Sentry estar configurado ou
// não (só reporta de verdade se EXPO_PUBLIC_SENTRY_DSN estiver definido,
// ver src/lib/monitoring.ts). O GlobalErrorBoundary logo acima é quem de
// fato captura e reporta o erro de render.
export default Sentry.wrap(RootLayout);
