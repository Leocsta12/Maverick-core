import { supabase } from './supabase';

/**
 * Maverick Dor/Desconforto — Fase 1: registro manual, ligado (ou não) a
 * um exercício específico. Existe pra validar de verdade se os alertas
 * de risco de carga (ACWR/deload — ver trainingLoad.ts, periodization.ts)
 * estão evitando lesão: sem esse dado, "deload recomendado" é só uma
 * hipótese; com ele, dá pra cruzar "teve dor" com "estava em risco alto"
 * mais pra frente. Mesmo espírito de Health/Nutrition: registro simples
 * agora, análise melhora depois sem mudar o formato.
 */

export type PainEntry = {
  id: string;
  entryDate: string; // 'YYYY-MM-DD'
  bodyPart: string;
  exerciseId: string | null;
  exerciseName: string | null;
  severity: number; // 1-10
  notes: string | null;
  createdAt: string;
};

export type NewPainEntry = {
  entryDate: string;
  bodyPart: string;
  exerciseId?: string | null;
  severity: number;
  notes?: string | null;
};

/** Sugestões só pra agilizar o toque — o campo continua sendo texto livre. */
export const COMMON_BODY_PARTS = [
  'Ombro',
  'Joelho',
  'Lombar',
  'Quadril',
  'Cotovelo',
  'Punho',
  'Tornozelo',
  'Cervical',
  'Panturrilha',
  'Posterior de coxa',
];

export function severityLabel(severity: number): string {
  if (severity <= 3) return 'Leve';
  if (severity <= 6) return 'Moderada';
  return 'Forte';
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function addPainEntry(userId: string, entry: NewPainEntry): Promise<void> {
  const { error } = await supabase.from('pain_logs').insert({
    user_id: userId,
    entry_date: entry.entryDate,
    body_part: entry.bodyPart.trim(),
    exercise_id: entry.exerciseId ?? null,
    severity: entry.severity,
    notes: entry.notes?.trim() || null,
  });
  if (error) throw error;
}

export async function listPainEntries(userId: string, limit = 30): Promise<PainEntry[]> {
  const { data, error } = await supabase
    .from('pain_logs')
    .select('id, entry_date, body_part, exercise_id, severity, notes, created_at, exercises (name)')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    entryDate: row.entry_date,
    bodyPart: row.body_part,
    exerciseId: row.exercise_id,
    exerciseName: row.exercises?.name ?? null,
    severity: row.severity,
    notes: row.notes,
    createdAt: row.created_at,
  }));
}

export async function deletePainEntry(id: string): Promise<void> {
  const { error } = await supabase.from('pain_logs').delete().eq('id', id);
  if (error) throw error;
}
