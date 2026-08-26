import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';

export default function Login() {
  const { signIn, resendConfirmation } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleSubmit = async () => {
    setError(undefined);
    setNeedsConfirmation(false);
    setResent(false);
    if (!email || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      if (result.error.includes('Confirme seu e-mail')) setNeedsConfirmation(true);
      return;
    }
    router.replace('/'); // passa pelo gate de onboarding, não direto pro dashboard
  };

  const handleResend = async () => {
    setResending(true);
    const result = await resendConfirmation(email);
    setResending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setResent(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
        <Text style={styles.eyebrow}>MAVERICK PERFORMANCE</Text>
        <Text style={styles.title}>Entrar</Text>
        <Text style={styles.subtitle}>Acesse seu painel de performance.</Text>

        <View style={styles.form}>
          <TextField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="voce@email.com"
          />
          <TextField label="Senha" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {needsConfirmation ? (
            resent ? (
              <Text style={styles.resendSent}>E-mail reenviado — confira sua caixa de entrada.</Text>
            ) : (
              <Button
                label="Reenviar e-mail de confirmação"
                variant="ghost"
                onPress={handleResend}
                loading={resending}
                style={{ marginBottom: spacing.sm }}
              />
            )
          ) : null}
          <Button label="Entrar" onPress={handleSubmit} loading={loading} style={{ marginTop: spacing.sm }} />
          <Link href="/forgot-password" style={styles.forgotLink}>
            <Text style={styles.forgotLinkText}>Esqueci minha senha</Text>
          </Link>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Ainda não tem conta? </Text>
          <Link href="/signup">
            <Text style={styles.footerLink}>Criar conta</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg },
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 32, color: colors.textPrimary, marginTop: spacing.sm },
  subtitle: { fontFamily: typography.body, fontSize: 14, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xl },
  form: { marginTop: spacing.md },
  error: { color: colors.danger, fontFamily: typography.body, fontSize: 13, marginBottom: spacing.sm },
  forgotLink: { alignSelf: 'center', marginTop: spacing.md },
  forgotLinkText: { fontFamily: typography.bodyMedium, color: colors.textMuted, fontSize: 13 },
  resendSent: { color: colors.success, fontFamily: typography.body, fontSize: 13, marginBottom: spacing.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { fontFamily: typography.body, color: colors.textMuted, fontSize: 13 },
  footerLink: { fontFamily: typography.bodySemiBold, color: colors.ignition, fontSize: 13 },
});
