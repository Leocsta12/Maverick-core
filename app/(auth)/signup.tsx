import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';

export default function Signup() {
  const { signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const handleSubmit = async () => {
    setError(undefined);
    if (!name || !email || !password) {
      setError('Preencha todos os campos.');
      return;
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    const result = await signUp(name, email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsEmailConfirmation) {
      setAwaitingConfirmation(true);
      return;
    }
    router.replace('/'); // passa pelo gate de onboarding, não direto pro dashboard
  };

  if (awaitingConfirmation) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
          <Text style={styles.eyebrow}>MAVERICK PERFORMANCE</Text>
          <Text style={styles.title}>Confira seu e-mail</Text>
          <Text style={styles.subtitle}>
            Mandamos um link de confirmação para {email.trim()}. Clique nele para ativar sua conta e entrar.
          </Text>
          <View style={styles.footer}>
            <Link href="/login">
              <Text style={styles.footerLink}>Voltar para o login</Text>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
        <Text style={styles.eyebrow}>MAVERICK PERFORMANCE</Text>
        <Text style={styles.title}>Criar conta</Text>
        <Text style={styles.subtitle}>Comece a acompanhar sua evolução.</Text>

        <View style={styles.form}>
          <TextField label="Nome" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Seu nome" />
          <TextField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="voce@email.com"
          />
          <TextField label="Senha" value={password} onChangeText={setPassword} secureTextEntry placeholder="Mínimo 6 caracteres" />
          <TextField
            label="Confirmar senha"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="Repita a senha"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Criar conta" onPress={handleSubmit} loading={loading} style={{ marginTop: spacing.sm }} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Já tem conta? </Text>
          <Link href="/login">
            <Text style={styles.footerLink}>Entrar</Text>
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
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { fontFamily: typography.body, color: colors.textMuted, fontSize: 13 },
  footerLink: { fontFamily: typography.bodySemiBold, color: colors.ignition, fontSize: 13 },
});
