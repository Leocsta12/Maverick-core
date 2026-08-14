import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';

/**
 * Maverick Monitoring — Sentry (erro) + PostHog (analytics de produto).
 *
 * Os dois são opcionais por design, mesmo espírito de `isStravaConfigured()`
 * em strava.ts: sem as chaves configuradas, tudo aqui vira no-op silencioso
 * — o app roda normal em dev/CI sem precisar de conta em nenhum dos dois.
 * Nunca lança erro por falta de configuração (diferente de supabase.ts, que
 * é obrigatório) — errar ao configurar analytics não pode derrubar o app.
 */

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

export function isSentryConfigured(): boolean {
  return !!SENTRY_DSN;
}

export function isPostHogConfigured(): boolean {
  return !!POSTHOG_API_KEY;
}

// Chamado uma vez, o quanto antes possível (topo de app/_layout.tsx) — antes
// de qualquer módulo que possa lançar um erro durante o boot.
export function initSentry(): void {
  if (!isSentryConfigured()) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    // Amostra 100% em dev, 20% em produção — captura tudo enquanto o app é
    // pequeno, sem estourar a cota gratuita quando tiver usuários de verdade.
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    enabled: !__DEV__, // não manda evento de erro local — só builds reais
  });
}

let posthogClient: PostHog | null = null;

// Lazy: só cria o client se alguém de fato chamar trackEvent/identifyUser
// (evita inicializar o SDK e agendar timers em telas/testes que nunca
// disparam um evento).
function getPostHogClient(): PostHog | null {
  if (!isPostHogConfigured()) return null;
  if (!posthogClient) {
    posthogClient = new PostHog(POSTHOG_API_KEY!, { host: POSTHOG_HOST });
  }
  return posthogClient;
}

/** Manda uma exceção pro Sentry — no-op se não configurado (ex: dev local). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!isSentryConfigured()) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

// Subconjunto JSON-seguro — é o que a tipagem do PostHog aceita como
// propriedade de evento (nada de funções, Date, undefined aninhado, etc.).
type EventProperties = Record<string, string | number | boolean | null>;

/** Registra um evento de produto no PostHog — no-op se não configurado. */
export function trackEvent(name: string, properties?: EventProperties): void {
  const client = getPostHogClient();
  if (!client) return;
  client.capture(name, properties);
}

/** Marca de qual conta são os eventos daqui pra frente — chamado no login. */
export function identifyUser(userId: string, properties?: EventProperties): void {
  const client = getPostHogClient();
  if (!client) return;
  client.identify(userId, properties);
  Sentry.setUser(isSentryConfigured() ? { id: userId } : null);
}

/** Desfaz a identificação — chamado no logout, pra não misturar sessões no mesmo aparelho. */
export function resetUser(): void {
  const client = getPostHogClient();
  client?.reset();
  if (isSentryConfigured()) Sentry.setUser(null);
}

/** Navegação de tela — chamado a cada troca de rota (ver app/_layout.tsx). */
export function trackScreenView(pathname: string): void {
  trackEvent('$pageview', { path: pathname });
}
