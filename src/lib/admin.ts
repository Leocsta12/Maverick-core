import { supabase } from './supabase';

/**
 * Maverick Admin — painel operacional só de leitura pra quem administra o
 * app. Não é um "papel" de usuário como Coach (que exige vínculo aceito
 * por consentimento mútuo) — é uma lista fixa de contas (`app_admins`) que
 * só é editável direto no banco, nunca pelo cliente. As policies "select
 * as admin" (ver supabase/schema.sql) dão a mesma leitura que um Coach já
 * tem, só que sem precisar de vínculo — este arquivo reusa as mesmas
 * funções de listagem já usadas em Coach/pelo próprio dono dos dados.
 *
 * De propósito: nenhuma escrita aqui. Editar/apagar dado de um usuário
 * continua exigindo entrar como a Edge Function certa (service_role) ou
 * direto no banco — o app nunca oferece isso pelo painel de admin.
 */

export type AdminUser = {
  id: string;
  name: string;
  coachCode: string | null;
  createdAt: string;
};

/** Só um boolean — nunca expõe a lista de quem é admin pelo cliente. */
export async function isAppAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('am_i_admin');
  if (error) return false;
  return !!data;
}

export async function listAllUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, coach_code, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name || 'Sem nome',
    coachCode: row.coach_code,
    createdAt: row.created_at,
  }));
}
