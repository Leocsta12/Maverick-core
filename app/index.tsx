import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme/tokens';
import { hasSeenOnboarding } from '../src/lib/onboarding';

export default function Index() {
  const { user, isLoading } = useAuth();
  // null = ainda não sabe (evita um flash pro dashboard antes de
  // redirecionar pro onboarding, se for o caso).
  const [seenOnboarding, setSeenOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    hasSeenOnboarding()
      .then(setSeenOnboarding)
      .catch(() => setSeenOnboarding(true)); // falha ao ler = não trava o login por causa do tour
  }, [user]);

  if (isLoading || (user && seenOnboarding === null)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ignition} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  return <Redirect href={seenOnboarding ? '/dashboard' : '/onboarding'} />;
}
