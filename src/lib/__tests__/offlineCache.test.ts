import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadWithCache } from '../offlineCache';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('loadWithCache', () => {
  it('devolve o dado da rede e marca isFromCache como false quando a busca funciona', async () => {
    const result = await loadWithCache('chave-teste', async () => ({ valor: 42 }));
    expect(result).toEqual({ data: { valor: 42 }, isFromCache: false, cachedAt: null });
  });

  it('salva o resultado no cache local depois de uma busca bem-sucedida', async () => {
    await loadWithCache('chave-teste', async () => ({ valor: 42 }));
    await flush();
    const raw = await AsyncStorage.getItem('offline_cache:chave-teste');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).data).toEqual({ valor: 42 });
  });

  it('cai pro cache salvo quando a busca falha (ex: sem conexão)', async () => {
    await loadWithCache('chave-teste', async () => ({ valor: 42 }));
    await flush();

    const result = await loadWithCache('chave-teste', async () => {
      throw new Error('Simulated offline: Network request failed');
    });

    expect(result.isFromCache).toBe(true);
    expect(result.data).toEqual({ valor: 42 });
    expect(result.cachedAt).not.toBeNull();
  });

  it('propaga o erro original quando a busca falha e não existe nada em cache ainda', async () => {
    await expect(
      loadWithCache('chave-nunca-usada', async () => {
        throw new Error('Simulated offline: Network request failed');
      })
    ).rejects.toThrow('Simulated offline');
  });

  it('cada chave tem seu próprio cache — uma não vaza pra outra', async () => {
    await loadWithCache('treinos:atleta-a', async () => ({ nome: 'A' }));
    await flush();

    // atleta-b nunca teve uma busca bem-sucedida, então não deve herdar
    // o cache do atleta-a quando a dele falhar.
    await expect(
      loadWithCache('treinos:atleta-b', async () => {
        throw new Error('offline');
      })
    ).rejects.toThrow('offline');
  });
});
