import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

/**
 * Maverick Notificações — avisos proativos (prontidão baixa, deload
 * atrasado, prova chegando) sem precisar abrir o app pra descobrir.
 *
 * O cálculo de QUANDO avisar roda do lado do servidor (Edge Function
 * notify-athletes, disparada por cron — ver supabase/functions/
 * notify-athletes), não aqui. Este arquivo só cuida do lado do
 * dispositivo: pedir permissão, pegar o token push da Expo e salvar/
 * remover no banco.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Um token de push é ligado ao APARELHO, não à conta — se dois usuários
// diferentes logarem no mesmo aparelho (raro, mas acontece em telefone
// compartilhado), pode sobrar um token "órfão" de quem saiu. Aceitável
// pra v1: unique(user_id, token) em vez de unique(token) evita erro de
// conflito nesse cenário, só não limpa o token antigo sozinho — resolvido
// no logout (ver clearMyPushTokens, chamado no signOut).
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null; // emulador/simulador não recebe push de verdade

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null; // sem build nativo vinculado ao EAS, não tem como pedir o token

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  return token;
}

export async function saveMyPushToken(userId: string): Promise<void> {
  const token = await registerForPushNotifications();
  if (!token) return;
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'user_id,token' });
  if (error) throw error;
}

export async function clearMyPushTokens(userId: string): Promise<void> {
  const { error } = await supabase.from('push_tokens').delete().eq('user_id', userId);
  if (error) throw error;
}
