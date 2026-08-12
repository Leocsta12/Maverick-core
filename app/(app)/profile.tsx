import { useState } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { showAlert } from '../../src/lib/alert';

export default function Profile() {
  const { user, updateProfile, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({ name });
    setSaving(false);
    showAlert('Perfil atualizado');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
    >
      <Text style={styles.eyebrow}>PERFIL</Text>
      <Text style={styles.title}>Sua conta</Text>

      <TextField label="Nome" value={name} onChangeText={setName} autoCapitalize="words" />
      <TextField label="E-mail" value={user?.email ?? ''} editable={false} />

      <Button label="Salvar alterações" onPress={handleSave} loading={saving} style={{ marginTop: spacing.sm }} />
      <Button label="Sair" variant="ghost" onPress={signOut} style={{ marginTop: spacing.md }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.xl },
});
