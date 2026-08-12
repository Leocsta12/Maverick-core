import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';

export default function ForgotPassword() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSubmit = async () => {
    setError(undefined);
    if (!email.trim()) {
      setError('Informe seu e-mail.');
      return;
    }
    setLoading(true);
    // Linking.createURL resolve pro esquema nativo (maverick://reset-password)
    // ou pra origem atual no web — funciona nos dois sem lógica condicional.
    const redirectTo = Linking.createURL('/reset-password');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setLoading(false);
    // Por segurança, o Supabase não revela se o e-mail existe ou não — a
    // mensagem é a mesma nos dois casos, então não dá pra usar isso pra
    // descobrir quem tem conta no app.
    if (resetError) {
      setError('Não foi possível enviar o e-mail agora. Tente de novo em instantes.');
      return;
    }
    setSent(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
        <Text style={styles.eyebrow}>MAVERICK PERFORMANCE</Text>
        <Text style={styles.title}>Esqueceu a senha?</Text>
        <Text style={styles.subtitle}>
          Informe o e-mail da sua conta. Se ele existir, mandamos um link pra você criar uma senha nova.
        </Text>

        {sent ? (
          <View style={styles.sentBox}>
            <Text style={styles.sentText}>
              Se {email.trim()} tiver uma conta aqui, o e-mail de recuperação já foi enviado. Confira também
              a caixa de spam.
            </Text>
          </View>
        ) : (
          <View style={styles.form}>
            <TextField
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="voce@email.com"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Enviar link de recuperação" onPress={handleSubmit} loading={loading} style={{ marginTop: spacing.sm }} />
          </View>
        )}

        <View style={styles.footer}>
          <Link href="/login">
            <Text style={styles.footerLink}>Voltar para o login</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg },
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 28, color: colors.textPrimary, marginTop: spacing.sm },
  subtitle: { fontFamily: typography.body, fontSize: 14, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xl, lineHeight: 20 },
  form: { marginTop: spacing.md },
  error: { color: colors.danger, fontFamily: typography.body, fontSize: 13, marginBottom: spacing.sm },
  sentBox: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  sentText: { fontFamily: typography.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  footer: { alignItems: 'center', marginTop: spacing.xl },
  footerLink: { fontFamily: typography.bodySemiBold, color: colors.ignition, fontSize: 13 },
});
