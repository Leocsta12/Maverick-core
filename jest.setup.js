// Roda antes de qualquer teste importar código do app.

// src/lib/supabase.ts lê EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
// e lança erro no import se não estiverem definidas. Os testes daqui são só
// de lógica pura (cálculo de score, streak, etc.) — nunca fazem uma chamada
// de rede de verdade — então um valor falso é suficiente pra só permitir o
// módulo carregar, sem precisar de credenciais reais nem em CI.
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

// AsyncStorage real depende de módulos nativos que não existem rodando no
// Jest — troca pelo mock oficial do próprio pacote (armazenamento em
// memória, mesma API).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
