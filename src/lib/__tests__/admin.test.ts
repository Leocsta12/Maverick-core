// isAppAdmin é a única lógica de verdade aqui (fail-closed em erro — nunca
// deixa passar como admin por acaso); listAllUsers é um wrapper fino sobre
// o Supabase, sem lógica própria, mesmo padrão de coach.ts/health.ts (que
// não têm teste direto — só o que é lógica pura extraída deles).

jest.mock('../supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

import { supabase } from '../supabase';
import { isAppAdmin } from '../admin';

const mockedRpc = supabase.rpc as jest.Mock;

describe('isAppAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('true quando am_i_admin() devolve true', async () => {
    mockedRpc.mockResolvedValue({ data: true, error: null });
    expect(await isAppAdmin()).toBe(true);
  });

  it('false quando am_i_admin() devolve false', async () => {
    mockedRpc.mockResolvedValue({ data: false, error: null });
    expect(await isAppAdmin()).toBe(false);
  });

  it('fail-closed: false (não lança) quando a chamada dá erro', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: new Error('falhou') });
    expect(await isAppAdmin()).toBe(false);
  });
});
