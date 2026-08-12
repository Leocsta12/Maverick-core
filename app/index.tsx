import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme/tokens';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ignition} />
      </View>
    );
  }

  return <Redirect href={user ? '/dashboard' : '/login'} />;
}
