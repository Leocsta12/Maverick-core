import { getItem, setItem } from './storage';

/**
 * Maverick Onboarding — tour rápido de primeiro acesso.
 *
 * Guardado no aparelho (não no banco) de propósito: é sobre já ter visto
 * a explicação dos números do app, não sobre a conta em si — se o
 * usuário reinstalar ou trocar de aparelho, ver de novo não tem custo
 * nenhum (é só um tour, não onboarding com preferências salvas).
 */

const KEY = 'onboarding:seen';

export async function hasSeenOnboarding(): Promise<boolean> {
  return (await getItem<boolean>(KEY)) === true;
}

export async function markOnboardingSeen(): Promise<void> {
  await setItem(KEY, true);
}
