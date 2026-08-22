import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radius } from '../../src/theme/tokens';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { showAlert } from '../../src/lib/alert';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { loadWithCache } from '../../src/lib/offlineCache';
import { flushOfflineQueue, queuedWriteCount, upsertHealthEntryOffline } from '../../src/lib/offlineSync';
import { HealthEntry, computeMaverickScore, deriveInsight, listHealthEntries, todayIsoDate } from '../../src/lib/health';
import {
  StravaActivity,
  StravaStatus,
  activityTypeLabel,
  connectStrava,
  disconnectStrava,
  enduranceSportCategory,
  formatCadence,
  formatDistance,
  formatDuration,
  formatElevationGain,
  formatPaceMin100m,
  formatPaceMinKm,
  formatPower,
  formatSpeedKmh,
  getStravaStatus,
  isStravaConfigured,
  listStravaActivities,
  syncStravaActivities,
} from '../../src/lib/strava';
import {
  acuteChronicRatio,
  classifyZone,
  currentAndPreviousWeek,
  estimateMaxHeartrate,
  LOAD_RISK_LABELS,
  weeklyLoadSummary,
  zoneLabel,
  type LoadRisk,
  type WeeklyLoad,
} from '../../src/lib/trainingLoad';
import { computeReadiness } from '../../src/lib/readiness';
import { getRecentAverageRpe } from '../../src/lib/workouts';
import { detectDeloadStatus } from '../../src/lib/periodization';

// Segunda linha da atividade, com a métrica que realmente importa pra cada
// esporte — pace não diz nada pra quem pedala, potência quase nunca existe
// fora do pedal. `null` quando não há nada de endurance a mais pra mostrar
// (ex.: musculação registrada como atividade no Strava) — a linha some
// nesse caso em vez de aparecer vazia.
function enduranceMetricsLine(a: StravaActivity): string | null {
  const category = enduranceSportCategory(a.sportType);
  const parts: string[] = [];

  if (category === 'run') {
    parts.push(formatPaceMinKm(a.averageSpeedMs));
    parts.push(formatCadence(a.averageCadence, category));
    parts.push(formatElevationGain(a.totalElevationGainM));
  } else if (category === 'ride') {
    parts.push(formatSpeedKmh(a.averageSpeedMs));
    parts.push(formatPower(a.averageWatts, a.weightedAverageWatts));
    parts.push(formatCadence(a.averageCadence, category));
    parts.push(formatElevationGain(a.totalElevationGainM));
  } else if (category === 'swim') {
    parts.push(formatPaceMin100m(a.averageSpeedMs));
  } else {
    return null;
  }

  const filled = parts.filter((p) => p !== '—');
  return filled.length > 0 ? filled.join(' · ') : null;
}

function formatEntryDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export default function Health() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [sleepHours, setSleepHours] = useState('');
  const [hrvMs, setHrvMs] = useState('');
  const [restingHr, setRestingHr] = useState('');
  const [steps, setSteps] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);

  const loadEntries = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await loadWithCache(`health:${user.id}`, () => listHealthEntries(user.id));
      const data = result.data;
      setEntries(data);
      setOfflineSince(result.isFromCache ? result.cachedAt : null);
      const today = data.find((e) => e.entryDate === todayIsoDate());
      if (today) {
        setSleepHours(today.sleepHours?.toString() ?? '');
        setHrvMs(today.hrvMs?.toString() ?? '');
        setRestingHr(today.restingHr?.toString() ?? '');
        setSteps(today.steps?.toString() ?? '');
        setWeightKg(today.weightKg?.toString() ?? '');
        setBodyFatPct(today.bodyFatPct?.toString() ?? '');
      }

      // Se essa busca veio da rede de verdade (não do cache), é sinal de
      // que temos conexão — aproveita pra tentar despachar qualquer
      // registro que ficou pendente de quando estava offline.
      if (!result.isFromCache) {
        const { synced } = await flushOfflineQueue();
        if (synced > 0) {
          const refreshed = await loadWithCache(`health:${user.id}`, () => listHealthEntries(user.id));
          setEntries(refreshed.data);
        }
      }
      setPendingWrites(await queuedWriteCount());
    } catch {
      showAlert('Não foi possível carregar seus dados de Health.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const entryDate = todayIsoDate();
      const entry = {
        entryDate,
        sleepHours: sleepHours ? Number(sleepHours.replace(',', '.')) : null,
        hrvMs: hrvMs ? Number(hrvMs) : null,
        restingHr: restingHr ? Number(restingHr) : null,
        steps: steps ? Number(steps) : null,
        weightKg: weightKg ? Number(weightKg.replace(',', '.')) : null,
        bodyFatPct: bodyFatPct ? Number(bodyFatPct.replace(',', '.')) : null,
      };
      const result = await upsertHealthEntryOffline(user.id, entry);
      if (result.queued) {
        // Sem conexão: não dá pra recarregar do servidor, então atualiza
        // o estado local direto — é assim que o registro "aparece salvo"
        // na hora, mesmo esperando a rede voltar pra sincronizar de verdade.
        setEntries((prev) => [
          ...prev.filter((e) => e.entryDate !== entryDate),
          {
            id: `pending-${entryDate}`,
            entryDate,
            sleepHours: entry.sleepHours,
            hrvMs: entry.hrvMs,
            restingHr: entry.restingHr,
            steps: entry.steps,
            weightKg: entry.weightKg,
            bodyFatPct: entry.bodyFatPct,
          },
        ]);
        setPendingWrites(await queuedWriteCount());
        showAlert('Sem conexão agora — salvo no aparelho. Sincroniza sozinho assim que a internet voltar.');
      } else {
        await loadEntries();
        showAlert('Registro de hoje salvo.');
      }
    } catch {
      showAlert('Não foi possível salvar. Tente de novo.');
    } finally {
      setIsSaving(false);
    }
  };

  const score = computeMaverickScore(entries);
  const insight = deriveInsight(score);
  const history = entries.filter((e) => e.entryDate !== todayIsoDate());

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
    >
      <Text style={styles.eyebrow}>HEALTH</Text>
      <Text style={styles.title}>Seus sinais de hoje</Text>

      <OfflineBanner cachedAt={offlineSince} />
      {pendingWrites > 0 && (
        <Text style={styles.pendingNote}>
          {pendingWrites} registro{pendingWrites === 1 ? '' : 's'} aguardando conexão pra sincronizar.
        </Text>
      )}

      <View style={styles.scoreCard}>
        <Text style={styles.scoreValue}>{score ?? '—'}</Text>
        <Text style={styles.scoreLabel}>MAVERICK SCORE</Text>
        <Text style={styles.insightText}>{insight}</Text>
      </View>

      {user ? <ReadinessCard userId={user.id} recoveryScore={score} /> : null}

      <Text style={styles.sectionTitle}>Registrar hoje</Text>
      <TextField
        label="Sono (horas)"
        value={sleepHours}
        onChangeText={setSleepHours}
        keyboardType="decimal-pad"
        placeholder="7.5"
      />
      <TextField
        label="HRV (ms)"
        value={hrvMs}
        onChangeText={setHrvMs}
        keyboardType="number-pad"
        placeholder="52"
      />
      <TextField
        label="FC de repouso (bpm)"
        value={restingHr}
        onChangeText={setRestingHr}
        keyboardType="number-pad"
        placeholder="58"
      />
      <TextField
        label="Passos"
        value={steps}
        onChangeText={setSteps}
        keyboardType="number-pad"
        placeholder="8000"
      />
      <TextField
        label="Peso (kg)"
        value={weightKg}
        onChangeText={setWeightKg}
        keyboardType="decimal-pad"
        placeholder="78.5"
      />
      <TextField
        label="% de gordura (opcional)"
        value={bodyFatPct}
        onChangeText={setBodyFatPct}
        keyboardType="decimal-pad"
        placeholder="18.0"
      />
      <Button label="Salvar registro de hoje" onPress={handleSave} loading={isSaving} />

      <Text style={styles.sectionTitle}>Histórico</Text>
      {isLoading ? (
        <Text style={styles.emptyText}>Carregando…</Text>
      ) : history.length === 0 ? (
        <Text style={styles.emptyText}>Sem registros anteriores ainda.</Text>
      ) : (
        history.map((entry) => (
          <View key={entry.id} style={styles.historyRow}>
            <Text style={styles.historyDate}>{formatEntryDate(entry.entryDate)}</Text>
            <Text style={styles.historyValues}>
              {entry.sleepHours != null ? `${entry.sleepHours}h sono` : '—'} ·{' '}
              {entry.hrvMs != null ? `HRV ${entry.hrvMs}ms` : '—'} ·{' '}
              {entry.restingHr != null ? `FC ${entry.restingHr}bpm` : '—'} ·{' '}
              {entry.steps != null ? `${entry.steps} passos` : '—'}
              {entry.weightKg != null ? ` · ${entry.weightKg}kg` : ''}
              {entry.bodyFatPct != null ? ` · ${entry.bodyFatPct}% gordura` : ''}
            </Text>
          </View>
        ))
      )}

      {user ? <StravaSection userId={user.id} /> : null}

      <Text style={styles.footnote}>
        Integração automática com Garmin e Apple Health entra numa fase seguinte, escrevendo nesta
        mesma base — o registro manual continua funcionando como alternativa.
      </Text>
    </ScrollView>
  );
}

// Score de Prontidão — ver src/lib/readiness.ts. Combina o Maverick Score
// (recuperação, já calculado no componente pai) com o ACWR das atividades
// do Strava e o RPE médio recente de musculação. Busca esses dois últimos
// de forma independente da StravaSection (que tem seu próprio ciclo de
// carregamento) — é uma leitura pequena e não vale a pena acoplar os dois
// componentes só pra compartilhar esse fetch.
function ReadinessCard({ userId, recoveryScore }: { userId: string; recoveryScore: number | null }) {
  const [acwrRisk, setAcwrRisk] = useState<LoadRisk | null>(null);
  const [recentAvgRpe, setRecentAvgRpe] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [status, rpe] = await Promise.all([getStravaStatus(), getRecentAverageRpe(userId)]);
        let risk: LoadRisk | null = null;
        if (status.connected) {
          const activities = await listStravaActivities(userId);
          const maxHr = estimateMaxHeartrate(activities);
          if (maxHr != null) risk = acuteChronicRatio(activities, maxHr).risk;
        }
        if (!active) return;
        setAcwrRisk(risk);
        setRecentAvgRpe(rpe);
      } catch {
        // Silencioso — a prontidão cai pros sinais que deu pra calcular, igual o resto de Health.
      } finally {
        if (active) setIsReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (!isReady) return null;

  const readiness = computeReadiness({ recoveryScore, acwrRisk, recentAvgRpe });

  return (
    <View style={styles.readinessCard}>
      <View style={styles.readinessHeaderRow}>
        <Text style={styles.scoreLabel}>PRONTIDÃO DE TREINO</Text>
        <Text style={styles.readinessValue}>{readiness.score}</Text>
      </View>
      <Text style={styles.insightText}>{readiness.message}</Text>
    </View>
  );
}

function StravaSection({ userId }: { userId: string }) {
  const [status, setStatus] = useState<StravaStatus>({ connected: false });
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const s = await getStravaStatus();
      setStatus(s);
      setActivities(s.connected ? await listStravaActivities(userId) : []);
    } catch {
      // Silencioso — não deve travar o resto da tela de Health por causa disso.
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // FC máxima estimada do próprio histórico do atleta — é o que dá pra
  // usar sem pedir nenhum dado extra (idade, FC de repouso) antes da
  // feature funcionar. null enquanto não houver nenhuma atividade com
  // max_heartrate ainda sincronizada.
  const maxHeartrate = useMemo(() => estimateMaxHeartrate(activities), [activities]);

  if (!isStravaConfigured()) return null;

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await connectStrava();
      showAlert('Autorize o acesso na aba que abriu. Depois volte aqui e toque em "Sincronizar".');
    } catch {
      showAlert('Não foi possível abrir a autorização do Strava.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncStravaActivities();
      await load();
      showAlert(`${result.synced} atividade(s) sincronizada(s).`);
    } catch {
      showAlert('Não foi possível sincronizar agora. Confira se já autorizou o acesso.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = () => {
    showAlert('Desconectar Strava?', 'As atividades já sincronizadas continuam salvas no seu histórico.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar',
        style: 'destructive',
        onPress: async () => {
          await disconnectStrava(userId);
          await load();
        },
      },
    ]);
  };

  return (
    <>
      <Text style={styles.sectionTitle}>Atividades (Strava)</Text>
      {isLoading ? (
        <Text style={styles.emptyText}>Carregando…</Text>
      ) : !status.connected ? (
        <>
          <Text style={styles.emptyText}>
            Conecte sua conta do Strava para trazer corridas, pedais e caminhadas pro seu histórico.
          </Text>
          <Button label="Conectar com Strava" onPress={handleConnect} loading={isConnecting} style={{ marginTop: spacing.sm }} />
        </>
      ) : (
        <>
          <View style={styles.stravaHeaderRow}>
            <Text style={styles.stravaConnectedText}>Conectado ✓</Text>
            <Button label="Sincronizar" variant="ghost" onPress={handleSync} loading={isSyncing} style={styles.syncButton} />
          </View>
          {activities.length > 0 ? <TrainingLoadCard activities={activities} maxHeartrate={maxHeartrate} /> : null}
          {activities.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma atividade sincronizada ainda — toque em "Sincronizar".</Text>
          ) : (
            activities.map((a) => {
              const enduranceLine = enduranceMetricsLine(a);
              const zone =
                a.averageHeartrate != null && maxHeartrate != null
                  ? classifyZone(a.averageHeartrate, maxHeartrate)
                  : null;
              return (
                <View key={a.id} style={styles.historyRow}>
                  <View style={styles.historyDateRow}>
                    <Text style={styles.historyDate}>
                      {activityTypeLabel(a.sportType)} · {new Date(a.startedAt).toLocaleDateString('pt-BR')}
                    </Text>
                    {zone != null ? (
                      <Text style={styles.zoneBadge}>
                        Z{zone} · {zoneLabel(zone)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.historyValues}>
                    {formatDistance(a.distanceMeters)} · {formatDuration(a.movingTimeSeconds)}
                    {a.calories != null ? ` · ${Math.round(a.calories)} kcal` : ''}
                  </Text>
                  {enduranceLine ? <Text style={styles.historyMetrics}>{enduranceLine}</Text> : null}
                </View>
              );
            })
          )}
          <Button label="Desconectar" variant="ghost" onPress={handleDisconnect} style={{ marginTop: spacing.md }} />
        </>
      )}
    </>
  );
}

const RISK_COLORS: Record<string, string> = {
  ideal: colors.success,
  atencao: colors.warning,
  alto: colors.danger,
  baixa: colors.steel,
};

// Carga semanal (TRIMP simplificado) + ACWR — ver src/lib/trainingLoad.ts
// pro raciocínio completo. `maxHeartrate` null quando nenhuma atividade
// ainda trouxe max_heartrate (ex.: todas sincronizadas antes dessa coluna
// existir) — mostra uma dica em vez de tentar calcular sem base nenhuma.
function TrainingLoadCard({ activities, maxHeartrate }: { activities: StravaActivity[]; maxHeartrate: number | null }) {
  if (maxHeartrate == null) {
    return (
      <View style={styles.loadCard}>
        <Text style={styles.emptyText}>
          Assim que uma atividade trouxer frequência cardíaca máxima, a carga de treino semanal aparece aqui.
        </Text>
      </View>
    );
  }

  const weeks = weeklyLoadSummary(activities, maxHeartrate);
  const { thisWeek, lastWeek } = currentAndPreviousWeek(weeks);
  const acwr = acuteChronicRatio(activities, maxHeartrate);

  const trendPct =
    thisWeek && lastWeek && lastWeek.totalLoad > 0
      ? Math.round(((thisWeek.totalLoad - lastWeek.totalLoad) / lastWeek.totalLoad) * 100)
      : null;

  const sportBreakdown = thisWeek
    ? Object.entries(thisWeek.loadBySport)
        .sort((a, b) => b[1] - a[1])
        .map(([sport, load]) => `${activityTypeLabel(sport)}: ${Math.round(load)}`)
        .join(' · ')
    : '';

  return (
    <View style={styles.loadCard}>
      <View style={styles.loadHeaderRow}>
        <View>
          <Text style={styles.loadValue}>{thisWeek ? Math.round(thisWeek.totalLoad) : 0}</Text>
          <Text style={styles.loadLabel}>carga esta semana</Text>
        </View>
        {trendPct != null ? (
          <Text style={[styles.loadTrend, { color: trendPct > 0 ? colors.warning : colors.success }]}>
            {trendPct > 0 ? '↑' : '↓'} {Math.abs(trendPct)}% vs. semana passada
          </Text>
        ) : null}
      </View>
      <Text style={[styles.loadRisk, { color: RISK_COLORS[acwr.risk] }]}>{LOAD_RISK_LABELS[acwr.risk]}</Text>
      {sportBreakdown ? <Text style={styles.historyValues}>{sportBreakdown}</Text> : null}
      <DeloadHint weeks={weeks} acwrRisk={acwr.risk} />
    </View>
  );
}

// Periodização — ver src/lib/periodization.ts. Reaproveita as mesmas
// semanas já calculadas pelo card de carga, sem consulta nova nenhuma.
function DeloadHint({ weeks, acwrRisk }: { weeks: WeeklyLoad[]; acwrRisk: LoadRisk }) {
  const status = detectDeloadStatus(
    weeks.map((w) => ({ weekStartIso: w.weekStartIso, totalLoad: w.totalLoad })),
    acwrRisk
  );
  if (status.weeksSinceLastDeload == null) return null;
  return (
    <Text style={[styles.deloadHint, status.recommended && { color: colors.warning }]}>
      {status.recommended ? '⚠ ' : ''}
      {status.message}
    </Text>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.lg },
  scoreCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  scoreValue: { fontFamily: typography.display, fontSize: 48, color: colors.textPrimary },
  scoreLabel: { fontFamily: typography.mono, fontSize: 11, color: colors.steel, letterSpacing: 2, marginTop: 2 },
  insightText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.md,
  },
  readinessCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  readinessHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  readinessValue: { fontFamily: typography.display, fontSize: 22, color: colors.textPrimary },
  sectionTitle: {
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted },
  pendingNote: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.warning,
    marginBottom: spacing.md,
  },
  historyRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm,
  },
  historyDateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  historyDate: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 1 },
  zoneBadge: { fontFamily: typography.mono, fontSize: 10, color: colors.steel, letterSpacing: 1 },
  historyValues: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted },
  historyMetrics: {
    fontFamily: typography.bodySemiBold,
    fontSize: 12,
    color: colors.textPrimary,
    marginTop: 4,
  },
  loadCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  loadHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  loadValue: { fontFamily: typography.display, fontSize: 28, color: colors.textPrimary },
  loadLabel: { fontFamily: typography.mono, fontSize: 10, color: colors.steel, letterSpacing: 1 },
  loadTrend: { fontFamily: typography.bodySemiBold, fontSize: 12 },
  loadRisk: { fontFamily: typography.bodySemiBold, fontSize: 12, marginTop: spacing.xs, marginBottom: 4 },
  deloadHint: { fontFamily: typography.body, fontSize: 11, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 16 },
  stravaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  stravaConnectedText: { fontFamily: typography.bodySemiBold, fontSize: 13, color: colors.success },
  syncButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  footnote: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.steel,
    lineHeight: 16,
    marginTop: spacing.xl,
  },
});
