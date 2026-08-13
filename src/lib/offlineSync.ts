import { getItem, setItem } from './storage';
import { NewHealthEntry, upsertHealthEntry } from './health';
import { markDayDone, markDayUndone } from './workouts';

/**
 * Maverick Offline — Fase 2 (escrita). Fila persistida no aparelho: quando
 * uma escrita falha por falta de conexão, em vez de mostrar erro pro
 * atleta, guardamos a intenção aqui e ela sai sozinha assim que a rede
 * voltar (flushOfflineQueue) — chamado depois de qualquer carregamento
 * bem-sucedido em Health/Treinos, e uma vez ao abrir o app.
 *
 * Mesmo escopo da Fase 1 (só leitura): Health e Treinos, os dois módulos
 * onde offline faz mais sentido de verdade. "Escrever" aqui é só
 * registrar hoje (Health) e marcar/desmarcar o dia como feito (Treinos)
 * — as duas ações mais prováveis de alguém tentar fazer sem sinal
 * (saindo da academia, por exemplo). Fluxos que dependem de resposta da
 * rede pra fazer sentido (gerar treino por IA, analisar fotos) não são
 * enfileiráveis — não tem "intenção" pra guardar, só a chamada em si.
 */

type QueuedWrite =
  | { id: string; queuedAt: string; type: 'upsertHealthEntry'; payload: { userId: string; entry: NewHealthEntry } }
  | { id: string; queuedAt: string; type: 'markDayDone'; payload: { userId: string; planDayId: string; logDate: string } }
  | { id: string; queuedAt: string; type: 'markDayUndone'; payload: { planDayId: string; logDate: string } };

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

// --- Sincronização ---------------------------------------------------------

// Tenta replayar a fila em ordem (mais antiga primeiro). Pra no primeiro
// item que falhar de novo — se ainda não tem conexão, os próximos também
// vão falhar, não faz sentido bater a rede várias vezes seguidas.
export async function flushOfflineQueue(): Promise<{ synced: number; remaining: number }> {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const sorted = [...queue].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  let synced = 0;
  let stoppedAt = sorted.length;

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    try {
      if (item.type === 'upsertHealthEntry') {
        await upsertHealthEntry(item.payload.userId, item.payload.entry);
      } else if (item.type === 'markDayDone') {
        await markDayDone(item.payload.userId, item.payload.planDayId, item.payload.logDate);
      } else {
        await markDayUndone(item.payload.planDayId, item.payload.logDate);
      }
      synced++;
    } catch {
      stoppedAt = i;
      break;
    }
  }

  const remaining = sorted.slice(stoppedAt);
  await setQueue(remaining);
  return { synced, remaining: remaining.length };
}
