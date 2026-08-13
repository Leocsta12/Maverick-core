import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme/tokens';
import { AlertHost } from '../src/lib/alert';
import { flushOfflineQueue } from '../src/lib/offlineSync';

SplashScreen.preventAutoHideAsync().catch(() => {});

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

export default function RootLayout() {
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
    <SafeAreaProvider>
      <AuthProvider>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <StatusBar style="light" />
          <Slot />
          <AlertHost />
          <OfflineSyncOnStart />
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
