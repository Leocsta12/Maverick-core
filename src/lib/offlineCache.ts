import { getItem, setItem } from './storage';

/**
 * Maverick Offline (Fase 1: só leitura) — cache local "read-through" por
 * tela: tenta buscar do Supabase; se der certo, atualiza o cache pra
 * próxima vez; se falhar (sem sinal, ou qualquer outro erro de rede) e
 * existir algo salvo antes, devolve o cache em vez de quebrar a tela.
 *
 * Escrita continua exigindo conexão — registrar treino/refeição/sono
 * offline é fase 2 (fila de sincronização), não esta.
 *
 * Escopo desta fase: Treinos e Health, os dois módulos onde faz mais
 * sentido abrir sem sinal (academia, corrida). Os outros módulos seguem
 * exigindo conexão por enquanto.
 */

type CacheEnvelope<T> = { data: T; cachedAt: string };

export type CachedResult<T> = {
  data: T;
  isFromCache: boolean;
  cachedAt: string | null;
};

const PREFIX = 'offline_cache:';

export async function loadWithCache<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<CachedResult<T>> {
  const key = PREFIX + cacheKey;
  try {
    const data = await fetcher();
    // Não bloqueia o retorno por causa do cache — se salvar falhar, tudo bem,
    // só não vai ter fallback offline da próxima vez.
    setItem<CacheEnvelope<T>>(key, { data, cachedAt: new Date().toISOString() }).catch(() => {});
    return { data, isFromCache: false, cachedAt: null };
  } catch (err) {
    const cached = await getItem<CacheEnvelope<T>>(key);
    if (cached) {
      return { data: cached.data, isFromCache: true, cachedAt: cached.cachedAt };
    }
    throw err;
  }
}

export function formatCachedAt(iso: string): string {
  const date = new Date(iso);
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}
