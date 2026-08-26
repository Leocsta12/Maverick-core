import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/tokens';

export default function AuthLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  // Passa pela raiz (não direto pro dashboard) — é lá que mora o gate de
  // "já viu o tour de onboarding?" antes de decidir pra onde ir de verdade.
  if (user) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
