import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * FASE 2: autenticação via Supabase Auth. Sessão persistida no
 * dispositivo pelo próprio client do Supabase (ver src/lib/supabase.ts).
 *
 * A interface pública (useAuth) é idêntica à da Fase 1 (local/AsyncStorage)
 * — só o miolo mudou. Telas continuam iguais.
 */

export type MaverickUser = {
  id: string;
  name: string;
  email: string;
};

type AuthResult = { error?: string; needsEmailConfirmation?: boolean };

type AuthContextValue = {
  user: MaverickUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<MaverickUser, 'name' | 'email'>>) => Promise<void>;
  resendConfirmation: (email: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) return 'E-mail ou senha inválidos.';
  if (message.includes('User already registered')) return 'Este e-mail já está cadastrado.';
  if (message.includes('Password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (message.includes('Email not confirmed'))
    return 'Confirme seu e-mail antes de entrar — veja o link que mandamos pra sua caixa de entrada.';
  if (message.includes('email rate limit exceeded') || message.includes('over_email_send_rate_limit'))
    return 'Muitos e-mails enviados recentemente. Aguarde alguns minutos e tente de novo.';
  return message;
}

async function loadProfileName(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('name').eq('id', userId).single();
  return data?.name ?? '';
}

async function toMaverickUser(session: Session): Promise<MaverickUser> {
  const name = await loadProfileName(session.user.id);
  return {
    id: session.user.id,
    name,
    email: session.user.email ?? '',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MaverickUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      setUser(session ? await toMaverickUser(session) : null);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      setUser(session ? await toMaverickUser(session) : null);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signUp: AuthContextValue['signUp'] = async (name, email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) return { error: translateAuthError(error.message) };
    if (!data.session) {
      // Confirmação de e-mail ligada: a conta foi criada, mas ainda não há
      // sessão até a pessoa clicar no link que chega por e-mail. Isso não é
      // um erro — a tela de cadastro trata como um estado de sucesso à parte.
      return { needsEmailConfirmation: true };
    }
    return {};
  };

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) return { error: translateAuthError(error.message) };
    return {};
  };

  const resendConfirmation: AuthContextValue['resendConfirmation'] = async (email) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: normalizeEmail(email) });
    if (error) return { error: translateAuthError(error.message) };
    return {};
  };

  const signOut: AuthContextValue['signOut'] = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateProfile: AuthContextValue['updateProfile'] = async (patch) => {
    if (!user) return;

    if (patch.name !== undefined) {
      await supabase.from('profiles').update({ name: patch.name.trim() }).eq('id', user.id);
    }
    if (patch.email !== undefined) {
      await supabase.auth.updateUser({ email: normalizeEmail(patch.email) });
    }
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const value = useMemo(
    () => ({ user, isLoading, signIn, signUp, signOut, updateProfile, resendConfirmation }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  return ctx;
}
