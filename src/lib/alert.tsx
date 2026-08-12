import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertState = { title: string; message?: string; buttons: AlertButton[] } | null;

let currentState: AlertState = null;
let listeners: Array<(s: AlertState) => void> = [];

function setState(s: AlertState) {
  currentState = s;
  listeners.forEach((l) => l(s));
}

/**
 * Substituto direto de `Alert.alert` — no react-native-web, `Alert.alert` é
 * um no-op (não mostra absolutamente nada, silenciosamente: ver
 * node_modules/react-native-web/src/exports/Alert). Isso quebrava toda
 * mensagem de erro/sucesso e toda confirmação do app quando rodando no
 * navegador (só funcionava em iOS/Android nativo via Expo Go). No web,
 * renderiza um modal próprio (via <AlertHost/>, montado uma vez na raiz do
 * app) em vez de depender de window.confirm/alert — diálogos nativos do
 * navegador travam a thread de forma pouco confiável em alguns ambientes.
 * Fora do web, usa o Alert nativo de sempre. Mesma assinatura de
 * `Alert.alert`, então é só trocar o import.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const resolvedButtons = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  setState({ title, message, buttons: resolvedButtons });
}

function close(onPress?: () => void) {
  setState(null);
  onPress?.();
}

// Monta uma única vez em app/_layout.tsx. No nativo não renderiza nada (o
// Alert de verdade cuida de tudo); no web, é a UI real por trás de showAlert.
export function AlertHost() {
  const [state, setLocalState] = useState<AlertState>(currentState);

  useEffect(() => {
    listeners.push(setLocalState);
    return () => {
      listeners = listeners.filter((l) => l !== setLocalState);
    };
  }, []);

  if (Platform.OS !== 'web' || !state) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close()}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{state.title}</Text>
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
          <View style={styles.buttonRow}>
            {state.buttons.map((b, i) => (
              <Pressable
                key={i}
                onPress={() => close(b.onPress)}
                style={({ pressed }) => [
                  styles.button,
                  b.style === 'cancel' && styles.buttonCancel,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    b.style === 'destructive' && styles.buttonTextDestructive,
                    b.style === 'cancel' && styles.buttonTextCancel,
                  ]}
                >
                  {b.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  title: { fontFamily: typography.bodySemiBold, fontSize: 16, color: colors.textPrimary },
  message: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 19 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
  button: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  buttonCancel: {},
  buttonText: { fontFamily: typography.bodySemiBold, fontSize: 14, color: colors.ignition },
  buttonTextCancel: { color: colors.textMuted },
  buttonTextDestructive: { color: colors.danger },
});
