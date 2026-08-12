import { supabase } from './supabase';

/**
 * Maverick Health — Fase 1: registro manual.
 *
 * O formato de HealthEntry é o mesmo que uma sincronização automática
 * futura (Garmin / Apple Health / Strava) vai escrever — essas integrações
 * entram depois só trocando "quem grava" nesta tabela, sem mudar a tela
 * nem o cálculo do score.
 */

export type HealthEntry = {
  id: string;
  entryDate: string; // 'YYYY-MM-DD'
  sleepHours: number | null;
  hrvMs: number | null;
  restingHr: number | null;
  steps: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
};

export type NewHealthEntry = {
  entryDate: string;
  sleepHours?: number | null;
  hrvMs?: number | null;
  restingHr?: number | null;
  steps?: number | null;
  weightKg?: number | null;
  bodyFatPct?: number | null;
};

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listHealthEntries(userId: string, limit = 30): Promise<HealthEntry[]> {
  const { data, error } = await supabase
    .from('health_entries')
    .select('id, entry_date, sleep_hours, hrv_ms, resting_hr, steps, weight_kg, body_fat_pct')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    entryDate: row.entry_date,
    sleepHours: row.sleep_hours,
    hrvMs: row.hrv_ms,
    restingHr: row.resting_hr,
    steps: row.steps,
    weightKg: row.weight_kg,
    bodyFatPct: row.body_fat_pct,
  }));
}

// Upsert: registrar o mesmo dia de novo atualiza a linha existente em vez
// de duplicar (chave única user_id + entry_date no banco).
export async function upsertHealthEntry(userId: string, entry: NewHealthEntry): Promise<void> {
  const { error } = await supabase.from('health_entries').upsert(
    {
      user_id: userId,
      entry_date: entry.entryDate,
      sleep_hours: entry.sleepHours ?? null,
      hrv_ms: entry.hrvMs ?? null,
      resting_hr: entry.restingHr ?? null,
      steps: entry.steps ?? null,
      weight_kg: entry.weightKg ?? null,
      body_fat_pct: entry.bodyFatPct ?? null,
    },
    { onConflict: 'user_id,entry_date' }
  );

  if (error) throw error;
}

// --- Cálculo do Maverick Score ------------------------------------------
//
// Princípio 001 do produto: nunca mostrar um número sem explicar a leitura.
// Por isso o score é uma combinação legível de 4 sinais, cada um 0-100:
//
//   Sono (35%)      — horas de sono vs. meta de 8h.
//   HRV (30%)       — hoje comparado com a média das últimas até 14 entradas
//                      (linha de base pessoal; HRV mais alto que o normal = melhor).
//   FC repouso (20%) — hoje comparado com a mesma linha de base pessoal
//                      (FC de repouso mais baixa que o normal = melhor).
//   Passos (15%)    — passos vs. meta de 8.000/dia.
//
// Sem histórico suficiente pra montar a linha de base pessoal (ex: primeiro
// registro), esse sinal usa um valor neutro em vez de 0 ou 100 — assim o
// score não fica artificialmente extremo nos primeiros dias de uso.

const WEIGHTS = { sleep: 0.35, hrv: 0.3, restingHr: 0.2, steps: 0.15 } as const;
const SLEEP_TARGET_HOURS = 8;
const STEPS_TARGET = 8000;
const NEUTRAL_SIGNAL_SCORE = 70;
const BASELINE_WINDOW = 14;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Recebe entradas em qualquer ordem, calcula o score da mais recente. */
export function computeMaverickScore(entries: HealthEntry[]): number | null {
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  const latest = sorted[sorted.length - 1];
  const baseline = sorted.slice(0, -1).slice(-BASELINE_WINDOW);

  const sleepScore =
    latest.sleepHours != null ? clamp((latest.sleepHours / SLEEP_TARGET_HOURS) * 100) : NEUTRAL_SIGNAL_SCORE;

  const stepsScore = latest.steps != null ? clamp((latest.steps / STEPS_TARGET) * 100) : NEUTRAL_SIGNAL_SCORE;

  const hrvBaseline = average(baseline.map((e) => e.hrvMs).filter((v): v is number => v != null));
  const hrvScore =
    latest.hrvMs != null && hrvBaseline
      ? clamp(50 + ((latest.hrvMs - hrvBaseline) / hrvBaseline) * 200)
      : NEUTRAL_SIGNAL_SCORE;

  const rhrBaseline = average(baseline.map((e) => e.restingHr).filter((v): v is number => v != null));
  const restingHrScore =
    latest.restingHr != null && rhrBaseline
      ? clamp(50 - ((latest.restingHr - rhrBaseline) / rhrBaseline) * 200)
      : NEUTRAL_SIGNAL_SCORE;

  const weighted =
    sleepScore * WEIGHTS.sleep +
    hrvScore * WEIGHTS.hrv +
    restingHrScore * WEIGHTS.restingHr +
    stepsScore * WEIGHTS.steps;

  return Math.round(clamp(weighted));
}

export function deriveInsight(score: number | null): string {
  if (score == null) {
    return 'Registre seu sono, HRV, FC de repouso e passos de hoje no módulo Health para calcularmos seu Maverick Score.';
  }
  if (score >= 75) {
    return (
      'Sua recuperação está em bom nível esta semana. É um dia favorável para um treino de maior ' +
      'intensidade — priorize a qualidade do sono hoje à noite para manter esse ritmo.'
    );
  }
  if (score >= 50) {
    return 'Recuperação em nível moderado. Treine com intensidade normal, mas fique de olho no sono e na hidratação hoje.';
  }
  return 'Sinais de recuperação baixa. Considere um treino leve ou um dia de descanso ativo — priorize dormir mais esta noite.';
}
