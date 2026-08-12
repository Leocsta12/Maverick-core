import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase não configurado: defina EXPO_PUBLIC_SUPABASE_URL e ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY em um arquivo .env.local na raiz do projeto ' +
      '(veja .env.example).'
  );
}

// AsyncStorage (web) usa `window.localStorage` por baixo dos panos. Se algum
// dia este código voltar a rodar em SSR (Node, sem `window`), essa guarda
// evita o crash — vira um storage "vazio" nesse contexto, sem quebrar o boot.
const isBrowser = typeof window !== 'undefined';
const authStorage = isBrowser
  ? AsyncStorage
  : {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
