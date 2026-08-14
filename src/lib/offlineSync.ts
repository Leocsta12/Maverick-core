import { getItem, setItem } from './storage';
import { NewHealthEntry, upsertHealthEntry } from './health';
import { markDayDone, markDayUndone } from './workouts';
import { NewMeal, addMeal, addWater } from './nutrition';

/**
 * Maverick Offline — Fase 2 (escrita). Fila persistida no aparelho: quando
 * uma escrita falha por falta de conexão, em vez de mostrar erro pro
 * atleta, guardamos a intenção aqui e ela sai sozinha assim que a rede
 * voltar (flushOfflineQueue) — chamado depois de qualquer carregamento
 * bem-sucedido em Health/Treinos/Nutrition, e uma vez ao abrir o app.
 *
 * Mesmo espírito da Fase 1 (só leitura): só as ações mais prováveis de
 * alguém tentar fazer sem sinal (saindo da academia, por exemplo) entram
 * na fila — registrar hoje (Health), marcar/desmarcar o dia como feito
 * (Treinos), registrar refeição e água (Nutrition). Editar/remover coisas
 * já salvas (deletar refeição, desfazer água, editar metas) continua só
 * online — são ações secundárias, e simular offline pra elas também não
 * compensa a complexidade. Fluxos que dependem de resposta da rede pra
 * fazer sentido (gerar treino por IA, analisar fotos) não são
 * enfileiráveis — não tem "intenção" pra guardar, só a chamada em si.
 */

type QueuedWrite =
  | { id: string; queuedAt: string; type: 'upsertHealthEntry'; payload: { userId: string; entry: NewHealthEntry } }
  | { id: string; queuedAt: string; type: 'markDayDone'; payload: { userId: string; planDayId: string; logDate: string } }
  | { id: string; queuedAt: string; type: 'markDayUndone'; payload: { planDayId: string; logDate: string } }
  | { id: string; queuedAt: string; type: 'addMeal'; payload: { userId: string; meal: NewMeal } }
  | { id: string; queuedAt: string; type: 'addWater'; payload: { userId: string; entryDate: string; amountMl: number } };

const QUEUE_KEY = 'offline_write_queue';

async function getQueue(): Promise<QueuedWrite[]> {
  return (await getItem<QueuedWrite[]>(QUEUE_KEY)) ?? [];
}

async function setQueue(queue: QueuedWrite[]): Promise<void> {
  await setItem(QUEUE_KEY, queue);
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isSameToggleTarget(w: QueuedWrite, planDayId: string, logDate: string): boolean {
  return (w.type === 'markDayDone' || w.type === 'markDayUndone') && w.payload.planDayId === planDayId && w.payload.logDate === logDate;
}

export async function queuedWriteCount(): Promise<number> {
  return (await getQueue()).length;
}

// --- Health --------------------------------------------------------------

export async function upsertHealthEntryOffline(userId: string, entry: NewHealthEntry): Promise<{ queued: boolean }> {
  try {
    await upsertHealthEntry(userId, entry);
    return { queued: false };
  } catch {
    const queue = await getQueue();
    // Um dia só tem um registro (upsert) — se já tinha uma escrita
    // pendente pra esse mesmo dia, a nova substitui em vez de empilhar.
    const withoutSameDay = queue.filter((w) => !(w.type === 'upsertHealthEntry' && w.payload.entry.entryDate === entry.entryDate));
    withoutSameDay.push({ id: newId(), queuedAt: new Date().toISOString(), type: 'upsertHealthEntry', payload: { userId, entry } });
    await setQueue(withoutSameDay);
    return { queued: true };
  }
}

// --- Treinos ---------------------------------------------------------------

export async function markDayDoneOffline(userId: string, planDayId: string, logDate: string): Promise<{ queued: boolean }> {
  try {
    await markDayDone(userId, planDayId, logDate);
    return { queued: false };
  } catch {
    const queue = await getQueue();
    // Marcar/desmarcar o mesmo dia várias vezes offline não deve empilhar
    // eventos — só importa o estado final desejado ("last write wins").
    const withoutSame = queue.filter((w) => !isSameToggleTarget(w, planDayId, logDate));
    withoutSame.push({ id: newId(), queuedAt: new Date().toISOString(), type: 'markDayDone', payload: { userId, planDayId, logDate } });
    await setQueue(withoutSame);
    return { queued: true };
  }
}

export async function markDayUndoneOffline(planDayId: string, logDate: string): Promise<{ queued: boolean }> {
  try {
    await markDayUndone(planDayId, logDate);
    return { queued: false };
  } catch {
    const queue = await getQueue();
    const withoutSame = queue.filter((w) => !isSameToggleTarget(w, planDayId, logDate));
    withoutSame.push({ id: newId(), queuedAt: new Date().toISOString(), type: 'markDayUndone', payload: { planDayId, logDate } });
    await setQueue(withoutSame);
    return { queued: true };
  }
}

// --- Nutrition ---------------------------------------------------------

export async function addMealOffline(userId: string, meal: NewMeal): Promise<{ queued: boolean }> {
  try {
    await addMeal(userId, meal);
    return { queued: false };
  } catch {
    const queue = await getQueue();
    // Cada refeição é um registro independente (não um estado único por
    // dia) — sempre acrescenta na fila, nunca substitui uma pendente.
    queue.push({ id: newId(), queuedAt: new Date().toISOString(), type: 'addMeal', payload: { userId, meal } });
    await setQueue(queue);
    return { queued: true };
  }
}

export async function addWaterOffline(userId: string, entryDate: string, amountMl: number): Promise<{ queued: boolean }> {
  try {
    await addWater(userId, entryDate, amountMl);
    return { queued: false };
  } catch {
    const queue = await getQueue();
    queue.push({ id: newId(), queuedAt: new Date().toISOString(), type: 'addWater', payload: { userId, entryDate, amountMl } });
    await setQueue(queue);
    return { queued: true };
  }
}

// --- Sincronização ---------------------------------------------------------

// Mais de uma tela dispara flushOfflineQueue() quase ao mesmo tempo (o
// OfflineSyncOnStart do app inteiro, e o load() de cada tela que usa
// cache). Sem essa trava, duas chamadas concorrentes leem a mesma fila
// antes de qualquer uma escrever de volta, e cada uma sincroniza os
// mesmos itens de novo — duplicando refeição/água/registro no servidor.
// Guarda a promise em andamento e devolve ela pra quem chamar durante o
// flush, em vez de cada chamada fazer sua própria leitura+escrita.
let flushInFlight: Promise<{ synced: number; remaining: number }> | null = null;

export function flushOfflineQueue(): Promise<{ synced: number; remaining: number }> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = doFlush().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

// Tenta replayar a fila em ordem (mais antiga primeiro). Pra no primeiro
// item que falhar de novo — se ainda não tem conexão, os próximos também
// vão falhar, não faz sentido bater a rede várias vezes seguidas.
//
// A trava em memória (flushInFlight) cobre chamadas concorrentes dentro do
// mesmo processo JS — mas um recarregamento de página em cima da hora (ou
// duas abas) roda em processos separados, cada um com sua própria trava em
// memória. Por isso cada item é removido da fila PERSISTIDA antes de tentar
// sincronizar (não só no final): encolhe a janela de corrida pra "ler +
// escrever um item" em vez de "processar a fila inteira", então mesmo um
// processo separado lendo a fila nesse meio-tempo já não vê o item que
// outro processo está processando agora.
async function doFlush(): Promise<{ synced: number; remaining: number }> {
  const initialQueue = await getQueue();
  if (initialQueue.length === 0) return { synced: 0, remaining: 0 };

  const sorted = [...initialQueue].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  let synced = 0;

  for (const item of sorted) {
    const current = await getQueue();
    await setQueue(current.filter((w) => w.id !== item.id));

    try {
      if (item.type === 'upsertHealthEntry') {
        await upsertHealthEntry(item.payload.userId, item.payload.entry);
      } else if (item.type === 'markDayDone') {
        await markDayDone(item.payload.userId, item.payload.planDayId, item.payload.logDate);
      } else if (item.type === 'markDayUndone') {
        await markDayUndone(item.payload.planDayId, item.payload.logDate);
      } else if (item.type === 'addMeal') {
        await addMeal(item.payload.userId, item.payload.meal);
      } else {
        await addWater(item.payload.userId, item.payload.entryDate, item.payload.amountMl);
      }
      synced++;
    } catch {
      // Ainda sem conexão — devolve o item pra fila e para por aqui (os
      // próximos, mais recentes, também vão falhar). A ordem se resolve
      // sozinha na próxima chamada, que reordena por queuedAt de novo.
      const afterFailure = await getQueue();
      await setQueue([...afterFailure, item]);
      const remaining = await getQueue();
      return { synced, remaining: remaining.length };
    }
  }

  const remaining = await getQueue();
  return { synced, remaining: remaining.length };
}
