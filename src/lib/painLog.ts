import { supabase } from './supabase';
import { acuteChronicRatio, estimateMaxHeartrate, type LoadableActivity, type LoadRisk } from './trainingLoad';

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

// --- Correlação com risco de carga (ACWR) ---------------------------------
//
// O ponto inteiro de registrar dor é validar se os alertas de risco de
// carga (ver trainingLoad.ts) realmente anteciparam o problema. Como
// acuteChronicRatio aceita um `now` arbitrário, dá pra perguntar "qual
// era o ACWR NAQUELE DIA" em vez de só "qual é o ACWR hoje" — reaproveita
// a mesma fórmula já testada, sem duplicar nada.

export type PainEntryWithRisk = PainEntry & { loadRiskAtTime: LoadRisk | null };

/** LoadableActivity + FC máxima da própria atividade — é o que estimateMaxHeartrate precisa pra achar a FC máxima do atleta. */
type ActivityForRiskCorrelation = LoadableActivity & { maxHeartrate: number | null };

/**
 * Marca cada registro de dor com o risco de carga que existia NAQUELE
 * DIA (não o risco de hoje). `loadRiskAtTime` vem null quando não há FC
 * máxima estimável (sem Strava conectado, ou sem atividade com FC ainda)
 * — nesse caso não dá pra afirmar nada, nem "alto" nem "ideal".
 */
export function annotatePainWithLoadRisk(entries: PainEntry[], activities: ActivityForRiskCorrelation[]): PainEntryWithRisk[] {
  const maxHeartrate = estimateMaxHeartrate(activities);
  if (maxHeartrate == null) return entries.map((e) => ({ ...e, loadRiskAtTime: null }));

  return entries.map((e) => {
    // Meio-dia local evita cair do lado errado da virada de dia por causa
    // de fuso horário — mesmo cuidado usado em outros lugares do app que
    // lidam com datas "só dia" vindas do Postgres.
    const atDate = new Date(`${e.entryDate}T12:00:00`);
    return { ...e, loadRiskAtTime: acuteChronicRatio(activities, maxHeartrate, atDate).risk };
  });
}

export type PainRiskSummary = {
  /** Registros de dor forte (severidade >= 7) com risco de carga conhecido naquele dia. */
  severeWithKnownRisk: number;
  /** Desses, quantos aconteceram com ACWR "alto" — o alerta bateu ANTES do problema. */
  severeDuringHighRisk: number;
};

const SEVERE_THRESHOLD = 7;

/**
 * Resume a validação num número só: de todas as dores fortes com risco
 * conhecido, quantas aconteceram durante uma janela de ACWR "alto"? Um
 * número alto aqui é evidência de que o alerta de carga é um bom
 * preditor; um número baixo sugere que a dor tem outra causa (técnica,
 * fadiga acumulada fora do que o ACWR capta, etc.) — os dois são
 * informação útil pro treinador.
 */
export function summarizePainRiskCorrelation(entries: PainEntryWithRisk[]): PainRiskSummary {
  const severe = entries.filter((e) => e.severity >= SEVERE_THRESHOLD && e.loadRiskAtTime != null);
  return {
    severeWithKnownRisk: severe.length,
    severeDuringHighRisk: severe.filter((e) => e.loadRiskAtTime === 'alto').length,
  };
}
