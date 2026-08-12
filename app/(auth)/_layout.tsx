import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme/tokens';

export default function AuthLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (user) return <Redirect href="/dashboard" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
