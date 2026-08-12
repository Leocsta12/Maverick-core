import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { colors, spacing, typography } from '../src/theme/tokens';
import { TextField } from '../src/components/TextField';
import { Button } from '../src/components/Button';

/**
 * Tela de destino do link de "esqueci minha senha". Fica FORA dos grupos
 * (auth)/(app) de propósito: o link de recuperação autentica a pessoa numa
 * sessão temporária (é assim que o Supabase confirma que ela é dona do
 * e-mail) — se essa tela estivesse dentro de (auth), o layout de lá
 * redirecionaria direto pro dashboard antes dela poder trocar a senha.
 */
export default function ResetPassword() {
  const insets = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code?: string }>();

  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        setStatus(exchangeError ? 'invalid' : 'ready');
        return;
      }
      // Sem "code" na URL — confere se já existe uma sessão de recuperação
      // válida (ex: reabriu a tela depois do primeiro carregamento).
      const { data } = await supabase.auth.getSession();
      setStatus(data.session ? 'ready' : 'invalid');
    })();
  }, [code]);

  const handleSave = async () => {
    setError(undefined);
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError('Não foi possível salvar a nova senha. Tente pedir um novo link.');
      return;
    }
    setDone(true);
    setTimeout(() => router.replace('/dashboard'), 1500);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
        <Text style={styles.eyebrow}>MAVERICK PERFORMANCE</Text>
        <Text style={styles.title}>Nova senha</Text>

        {status === 'checking' && <Text style={styles.subtitle}>Confirmando seu link…</Text>}

        {status === 'invalid' && (
          <Text style={styles.subtitle}>
            Esse link é inválido ou já expirou. Volte para a tela de login e peça um novo.
          </Text>
        )}

        {status === 'ready' && !done && (
          <View style={styles.form}>
            <Text style={styles.subtitle}>Escolha uma senha nova para sua conta.</Text>
            <TextField
              label="Nova senha"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Mínimo 6 caracteres"
            />
            <TextField
              label="Repita a nova senha"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Repita a senha"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Salvar nova senha" onPress={handleSave} loading={saving} style={{ marginTop: spacing.sm }} />
          </View>
        )}

        {done && <Text style={styles.subtitle}>Senha atualizada! Levando você pro painel…</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg },
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 28, color: colors.textPrimary, marginTop: spacing.sm, marginBottom: spacing.xs },
  subtitle: { fontFamily: typography.body, fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md },
  form: { marginTop: spacing.md },
  error: { color: colors.danger, fontFamily: typography.body, fontSize: 13, marginBottom: spacing.sm },
});
