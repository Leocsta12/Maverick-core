import { supabase } from './supabase';

/**
 * Maverick Coach — vínculo treinador↔atleta com aprovação manual.
 *
 * Qualquer usuário pode ser treinador e atleta ao mesmo tempo — não há
 * "papéis" fixos. O vínculo dá ao treinador acesso de LEITURA aos dados do
 * atleta (Health, Mission, Vision) via RLS no banco — este arquivo só chama
 * as mesmas funções de listagem já usadas pelo próprio dono dos dados
 * (elas recebem o userId como parâmetro, então funcionam pra qualquer
 * pessoa que a RLS deixar ver).
 */

export type LinkStatus = 'pending' | 'accepted' | 'rejected';

export type CoachLink = {
  id: string;
  coachId: string;
  athleteId: string;
  status: LinkStatus;
  requestedBy: string;
  createdAt: string;
};

export type LinkedPerson = {
  id: string;
  name: string;
};

export async function getMyCoachCode(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('coach_code').eq('id', userId).single();
  if (error) throw error;
  return data?.coach_code ?? null;
}

// Erros da função vêm com essa mensagem (raise exception no Postgres) —
// mapeados aqui pra algo legível.
function translateLinkError(message: string): string {
  if (message.includes('CODIGO_INVALIDO')) return 'Código inválido — confira e tente de novo.';
  if (message.includes('NAO_PODE_VINCULAR_A_SI_MESMO')) return 'Você não pode se vincular ao seu próprio código.';
  if (message.includes('JA_VINCULADO')) return 'Vocês já têm um vínculo ativo.';
  return message;
}

export async function requestCoachLink(code: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('request_coach_link', { p_code: code });
  if (error) return { error: translateLinkError(error.message) };
  return {};
}

export async function respondToLink(linkId: string, accept: boolean): Promise<void> {
  const { error } = await supabase
    .from('coach_links')
    .update({ status: accept ? 'accepted' : 'rejected', responded_at: new Date().toISOString() })
    .eq('id', linkId);
  if (error) throw error;
}

export async function removeLink(linkId: string): Promise<void> {
  const { error } = await supabase.from('coach_links').delete().eq('id', linkId);
  if (error) throw error;
}

async function fetchNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('profiles').select('id, name').in('id', ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.name || 'Sem nome']));
}

// Pedidos onde EU preciso responder (a contraparte pediu e está esperando).
export async function listPendingForMe(userId: string): Promise<
  Array<CoachLink & { counterpart: LinkedPerson; iAmCoach: boolean }>
> {
  const { data, error } = await supabase
    .from('coach_links')
    .select('id, coach_id, athlete_id, status, requested_by, created_at')
    .eq('status', 'pending')
    .neq('requested_by', userId)
    .or(`coach_id.eq.${userId},athlete_id.eq.${userId}`);
  if (error) throw error;

  const rows = data ?? [];
  const counterpartIds = rows.map((r) => (r.coach_id === userId ? r.athlete_id : r.coach_id));
  const names = await fetchNames(counterpartIds);

  return rows.map((r) => ({
    id: r.id,
    coachId: r.coach_id,
    athleteId: r.athlete_id,
    status: r.status,
    requestedBy: r.requested_by,
    createdAt: r.created_at,
    iAmCoach: r.coach_id === userId,
    counterpart: {
      id: r.coach_id === userId ? r.athlete_id : r.coach_id,
      name: names.get(r.coach_id === userId ? r.athlete_id : r.coach_id) ?? 'Sem nome',
    },
  }));
}

// Vínculos aceitos onde EU sou o treinador — os atletas que eu acompanho.
export async function listMyAthletes(userId: string): Promise<Array<{ linkId: string; athlete: LinkedPerson }>> {
  const { data, error } = await supabase
    .from('coach_links')
    .select('id, athlete_id')
    .eq('coach_id', userId)
    .eq('status', 'accepted');
  if (error) throw error;

  const rows = data ?? [];
  const names = await fetchNames(rows.map((r) => r.athlete_id));

  return rows.map((r) => ({
    linkId: r.id,
    athlete: { id: r.athlete_id, name: names.get(r.athlete_id) ?? 'Sem nome' },
  }));
}

// Vínculos aceitos onde EU sou o atleta — meus treinadores.
export async function listMyCoaches(userId: string): Promise<Array<{ linkId: string; coach: LinkedPerson }>> {
  const { data, error } = await supabase
    .from('coach_links')
    .select('id, coach_id')
    .eq('athlete_id', userId)
    .eq('status', 'accepted');
  if (error) throw error;

  const rows = data ?? [];
  const names = await fetchNames(rows.map((r) => r.coach_id));

  return rows.map((r) => ({
    linkId: r.id,
    coach: { id: r.coach_id, name: names.get(r.coach_id) ?? 'Sem nome' },
  }));
}
