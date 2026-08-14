import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../health', () => ({ upsertHealthEntry: jest.fn() }));
jest.mock('../workouts', () => ({ markDayDone: jest.fn(), markDayUndone: jest.fn() }));
jest.mock('../nutrition', () => ({ addMeal: jest.fn(), addWater: jest.fn() }));

import { upsertHealthEntry } from '../health';
import { markDayDone, markDayUndone } from '../workouts';
import { addMeal, addWater } from '../nutrition';
import {
  addMealOffline,
  addWaterOffline,
  flushOfflineQueue,
  markDayDoneOffline,
  markDayUndoneOffline,
  queuedWriteCount,
  upsertHealthEntryOffline,
} from '../offlineSync';

const mockedUpsertHealthEntry = upsertHealthEntry as jest.Mock;
const mockedMarkDayDone = markDayDone as jest.Mock;
const mockedMarkDayUndone = markDayUndone as jest.Mock;
const mockedAddMeal = addMeal as jest.Mock;
const mockedAddWater = addWater as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('upsertHealthEntryOffline', () => {
  it('não enfileira nada quando a escrita funciona (isFromCache false)', async () => {
    mockedUpsertHealthEntry.mockResolvedValue(undefined);
    const result = await upsertHealthEntryOffline('u1', { entryDate: '2024-06-10', sleepHours: 8 });
    expect(result.queued).toBe(false);
    expect(await queuedWriteCount()).toBe(0);
  });

  it('enfileira quando a escrita falha (sem conexão)', async () => {
    mockedUpsertHealthEntry.mockRejectedValue(new TypeError('Network request failed'));
    const result = await upsertHealthEntryOffline('u1', { entryDate: '2024-06-10', sleepHours: 8 });
    expect(result.queued).toBe(true);
    expect(await queuedWriteCount()).toBe(1);
  });

  it('substitui a escrita pendente do mesmo dia em vez de empilhar (só o mais recente importa)', async () => {
    mockedUpsertHealthEntry.mockRejectedValue(new Error('offline'));
    await upsertHealthEntryOffline('u1', { entryDate: '2024-06-10', sleepHours: 6 });
    await upsertHealthEntryOffline('u1', { entryDate: '2024-06-10', sleepHours: 8 });
    expect(await queuedWriteCount()).toBe(1);
  });

  it('dias diferentes ficam como escritas pendentes separadas', async () => {
    mockedUpsertHealthEntry.mockRejectedValue(new Error('offline'));
    await upsertHealthEntryOffline('u1', { entryDate: '2024-06-09', sleepHours: 6 });
    await upsertHealthEntryOffline('u1', { entryDate: '2024-06-10', sleepHours: 8 });
    expect(await queuedWriteCount()).toBe(2);
  });
});

describe('markDayDoneOffline / markDayUndoneOffline', () => {
  it('não enfileira nada quando marcar como feito funciona', async () => {
    mockedMarkDayDone.mockResolvedValue('log-1');
    const result = await markDayDoneOffline('u1', 'day-1', '2024-06-10');
    expect(result.queued).toBe(false);
    expect(await queuedWriteCount()).toBe(0);
  });

  it('enfileira quando marcar como feito falha', async () => {
    mockedMarkDayDone.mockRejectedValue(new Error('offline'));
    const result = await markDayDoneOffline('u1', 'day-1', '2024-06-10');
    expect(result.queued).toBe(true);
    expect(await queuedWriteCount()).toBe(1);
  });

  it('marcar e desmarcar o mesmo dia offline não empilha — fica só a intenção final', async () => {
    mockedMarkDayDone.mockRejectedValue(new Error('offline'));
    mockedMarkDayUndone.mockRejectedValue(new Error('offline'));
    await markDayDoneOffline('u1', 'day-1', '2024-06-10');
    await markDayUndoneOffline('day-1', '2024-06-10');
    expect(await queuedWriteCount()).toBe(1);
  });
});

describe('addMealOffline / addWaterOffline', () => {
  it('não enfileira nada quando registrar a refeição funciona', async () => {
    mockedAddMeal.mockResolvedValue(undefined);
    const result = await addMealOffline('u1', { entryDate: '2024-06-10', mealType: 'almoco', name: 'Frango com arroz' });
    expect(result.queued).toBe(false);
    expect(await queuedWriteCount()).toBe(0);
  });

  it('enfileira quando registrar a refeição falha (sem conexão)', async () => {
    mockedAddMeal.mockRejectedValue(new TypeError('Network request failed'));
    const result = await addMealOffline('u1', { entryDate: '2024-06-10', mealType: 'almoco', name: 'Frango com arroz' });
    expect(result.queued).toBe(true);
    expect(await queuedWriteCount()).toBe(1);
  });

  it('duas refeições offline no mesmo dia empilham as duas — não é "last write wins"', async () => {
    mockedAddMeal.mockRejectedValue(new Error('offline'));
    await addMealOffline('u1', { entryDate: '2024-06-10', mealType: 'cafe_da_manha', name: 'Ovos' });
    await addMealOffline('u1', { entryDate: '2024-06-10', mealType: 'almoco', name: 'Frango com arroz' });
    expect(await queuedWriteCount()).toBe(2);
  });

  it('não enfileira nada quando registrar água funciona', async () => {
    mockedAddWater.mockResolvedValue(undefined);
    const result = await addWaterOffline('u1', '2024-06-10', 300);
    expect(result.queued).toBe(false);
    expect(await queuedWriteCount()).toBe(0);
  });

  it('enfileira quando registrar água falha, e duas chamadas offline empilham as duas', async () => {
    mockedAddWater.mockRejectedValue(new Error('offline'));
    await addWaterOffline('u1', '2024-06-10', 300);
    await addWaterOffline('u1', '2024-06-10', 200);
    expect(await queuedWriteCount()).toBe(2);
  });
});

describe('flushOfflineQueue', () => {
  it('não faz nada quando a fila está vazia', async () => {
    const result = await flushOfflineQueue();
    expect(result).toEqual({ synced: 0, remaining: 0 });
  });

  it('sincroniza tudo e esvazia a fila quando a rede volta', async () => {
    mockedUpsertHealthEntry.mockRejectedValueOnce(new Error('offline'));
    await upsertHealthEntryOffline('u1', { entryDate: '2024-06-10', sleepHours: 8 });
    expect(await queuedWriteCount()).toBe(1);

    mockedUpsertHealthEntry.mockResolvedValue(undefined); // "conexão voltou"
    const result = await flushOfflineQueue();

    expect(result).toEqual({ synced: 1, remaining: 0 });
    expect(await queuedWriteCount()).toBe(0);
  });

  it('para no primeiro item que falhar de novo e mantém o resto na fila', async () => {
    mockedUpsertHealthEntry.mockRejectedValue(new Error('offline'));
    await upsertHealthEntryOffline('u1', { entryDate: '2024-06-08', sleepHours: 7 });
    await upsertHealthEntryOffline('u1', { entryDate: '2024-06-09', sleepHours: 7 });
    expect(await queuedWriteCount()).toBe(2);

    // ainda sem conexão na hora do flush
    const result = await flushOfflineQueue();

    expect(result).toEqual({ synced: 0, remaining: 2 });
    expect(await queuedWriteCount()).toBe(2);
  });

  it('processa na ordem em que foi enfileirado (mais antigo primeiro)', async () => {
    mockedMarkDayDone.mockRejectedValue(new Error('offline'));
    await markDayDoneOffline('u1', 'day-1', '2024-06-08');
    await markDayDoneOffline('u1', 'day-2', '2024-06-09');

    mockedMarkDayDone.mockResolvedValue('log-x');
    await flushOfflineQueue();

    expect(mockedMarkDayDone.mock.calls[0]).toEqual(['u1', 'day-1', '2024-06-08']);
    expect(mockedMarkDayDone.mock.calls[1]).toEqual(['u1', 'day-2', '2024-06-09']);
  });

  it('duas chamadas concorrentes não duplicam a sincronização (trava de flush em andamento)', async () => {
    mockedAddMeal.mockRejectedValueOnce(new Error('offline'));
    await addMealOffline('u1', { entryDate: '2024-06-10', mealType: 'almoco', name: 'Frango com arroz' });
    expect(await queuedWriteCount()).toBe(1);

    mockedAddMeal.mockClear(); // só nos importa quantas vezes o FLUSH chama addMeal, não a tentativa que falhou ao enfileirar
    mockedAddMeal.mockResolvedValue(undefined);
    // Duas telas chamando flush quase ao mesmo tempo (ex: OfflineSyncOnStart
    // do app inteiro + o load() da própria tela) — sem a trava, cada uma
    // lia a mesma fila e sincronizava o item de novo, duplicando no servidor.
    const [first, second] = await Promise.all([flushOfflineQueue(), flushOfflineQueue()]);

    expect(first).toEqual({ synced: 1, remaining: 0 });
    expect(second).toEqual({ synced: 1, remaining: 0 });
    expect(mockedAddMeal).toHaveBeenCalledTimes(1);
    expect(await queuedWriteCount()).toBe(0);
  });

  it('sincroniza uma mistura de refeição, água e treino numa fila só', async () => {
    mockedAddMeal.mockRejectedValueOnce(new Error('offline'));
    mockedAddWater.mockRejectedValueOnce(new Error('offline'));
    await addMealOffline('u1', { entryDate: '2024-06-10', mealType: 'almoco', name: 'Frango com arroz' });
    await addWaterOffline('u1', '2024-06-10', 300);
    expect(await queuedWriteCount()).toBe(2);

    mockedAddMeal.mockResolvedValue(undefined);
    mockedAddWater.mockResolvedValue(undefined);
    const result = await flushOfflineQueue();

    expect(result).toEqual({ synced: 2, remaining: 0 });
    expect(mockedAddMeal).toHaveBeenCalledWith('u1', { entryDate: '2024-06-10', mealType: 'almoco', name: 'Frango com arroz' });
    expect(mockedAddWater).toHaveBeenCalledWith('u1', '2024-06-10', 300);
  });
});
