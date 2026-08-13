import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../health', () => ({ upsertHealthEntry: jest.fn() }));
jest.mock('../workouts', () => ({ markDayDone: jest.fn(), markDayUndone: jest.fn() }));

import { upsertHealthEntry } from '../health';
import { markDayDone, markDayUndone } from '../workouts';
import { flushOfflineQueue, markDayDoneOffline, markDayUndoneOffline, queuedWriteCount, upsertHealthEntryOffline } from '../offlineSync';

const mockedUpsertHealthEntry = upsertHealthEntry as jest.Mock;
const mockedMarkDayDone = markDayDone as jest.Mock;
const mockedMarkDayUndone = markDayUndone as jest.Mock;

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
});
