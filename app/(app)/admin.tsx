import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../../src/theme/tokens';
import { showAlert } from '../../src/lib/alert';
import { AdminUser, isAppAdmin, listAllUsers } from '../../src/lib/admin';
import { AthleteOverview, CheckInSeverity, checkInStatus, getAthleteOverview } from '../../src/lib/coachOverview';
import { AthleteDetail } from './coach';

/**
 * Painel de admin — só leitura, pra quem administra o app (ver decisão em
 * supabase/schema.sql > app_admins). Reusa AthleteDetail de coach.tsx com
 * canEdit={false}: mesma UI de detalhe que o Coach já tem (Health,
 * Hábitos, Nutrição, Treino, Vision), só que chegando aqui via as
 * policies "select as admin" (sem precisar de vínculo) em vez de
 * coach_links. checkAccess roda em toda visita — quem não é admin nunca
 * vê a lista (a segurança de verdade é a RLS; isso é só não deixar a
 * tela carregar à toa pra quem não tem acesso mesmo).
 */
export default function Admin() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [isChecking, setIsChecking] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [overviews, setOverviews] = useState<Record<string, AthleteOverview>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOverviews, setIsLoadingOverviews] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await listAllUsers();
      setUsers(list);

      setIsLoadingOverviews(true);
      Promise.all(
        list.map(async (u) => {
          try {
            return [u.id, await getAthleteOverview(u.id)] as const;
          } catch {
            return [u.id, { score: null, lastCheckInDate: null }] as const;
          }
        })
      )
        .then((entries) => setOverviews(Object.fromEntries(entries)))
        .finally(() => setIsLoadingOverviews(false));
    } catch {
      showAlert('Não foi possível carregar os usuários.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    isAppAdmin()
      .then((allowed) => {
        if (!active) return;
        setIsAllowed(allowed);
        if (allowed) load();
      })
      .finally(() => active && setIsChecking(false));
    return () => {
      active = false;
    };
  }, [load]);

  const selectedUser = users.find((u) => u.id === selectedUserId);

  const severityRank: Record<CheckInSeverity, number> = { stale: 3, warn: 2, none: 1, ok: 0 };
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const severityA = checkInStatus(overviews[a.id]?.lastCheckInDate ?? null).severity;
      const severityB = checkInStatus(overviews[b.id]?.lastCheckInDate ?? null).severity;
      const diff = severityRank[severityB] - severityRank[severityA];
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
  }, [users, overviews]);

  if (isChecking) {
    return (
      <View style={[styles.centerWrap, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>Carregando…</Text>
      </View>
    );
  }

  if (!isAllowed) {
    return (
      <View style={[styles.centerWrap, { paddingTop: insets.top }]}>
        <Feather name="lock" size={24} color={colors.steel} />
        <Text style={styles.deniedTitle}>Sem acesso</Text>
        <Text style={styles.emptyText}>Essa tela é só pra quem administra o app.</Text>
        <Pressable onPress={() => router.replace('/dashboard')} style={{ marginTop: spacing.lg }}>
          <Text style={styles.backLink}>Voltar pro Painel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
    >
      <Text style={styles.eyebrow}>ADMIN</Text>
      <Text style={styles.title}>Todos os usuários</Text>

      <Text style={styles.summary}>
        {isLoading ? 'Carregando…' : `${users.length} usuário${users.length === 1 ? '' : 's'} cadastrado${users.length === 1 ? '' : 's'}`}
      </Text>

      {isLoading ? (
        <Text style={styles.emptyText}>Carregando…</Text>
      ) : users.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum usuário cadastrado ainda.</Text>
      ) : (
        sortedUsers.map((u) => {
          const overview = overviews[u.id];
          const status = checkInStatus(overview?.lastCheckInDate ?? null);
          return (
            <Pressable
              key={u.id}
              onPress={() => setSelectedUserId(selectedUserId === u.id ? null : u.id)}
              style={[styles.userRow, selectedUserId === u.id && styles.userRowSelected]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{u.name}</Text>
                <View style={styles.userStatusRow}>
                  <View style={[styles.statusDot, styles[`statusDot_${status.severity}`]]} />
                  <Text style={styles.userStatusText}>{isLoadingOverviews && !overview ? 'Carregando…' : status.label}</Text>
                </View>
              </View>
              {overview?.score != null && (
                <View style={styles.userScoreWrap}>
                  <Text style={styles.userScoreValue}>{overview.score}</Text>
                  <Text style={styles.userScoreLabel}>SCORE</Text>
                </View>
              )}
              <Feather
                name={selectedUserId === u.id ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.steel}
                style={{ marginLeft: spacing.xs }}
              />
            </Pressable>
          );
        })
      )}

      {selectedUser && <AthleteDetail athleteId={selectedUser.id} athleteName={selectedUser.name} canEdit={false} />}

      <Text style={styles.footnote}>
        Painel operacional, só leitura — pra suporte e acompanhamento geral, não é um papel de usuário
        como o Coach (que exige vínculo aceito por consentimento mútuo). Editar ou apagar dado de
        alguém não é feito por aqui.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerWrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  deniedTitle: { fontFamily: typography.bodySemiBold, fontSize: 16, color: colors.textPrimary, marginTop: spacing.sm, marginBottom: spacing.xs },
  backLink: { fontFamily: typography.bodySemiBold, fontSize: 14, color: colors.ignition },
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.sm },
  summary: { fontFamily: typography.mono, fontSize: 11, color: colors.textMuted, letterSpacing: 0.3, marginBottom: spacing.lg },
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted, lineHeight: 19, textAlign: 'center' },
  userRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userRowSelected: { borderColor: colors.ignition },
  userName: { fontFamily: typography.bodyMedium, fontSize: 15, color: colors.textPrimary },
  userStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDot_ok: { backgroundColor: colors.success },
  statusDot_warn: { backgroundColor: colors.warning },
  statusDot_stale: { backgroundColor: colors.danger },
  statusDot_none: { backgroundColor: colors.steel },
  userStatusText: { fontFamily: typography.body, fontSize: 11, color: colors.textMuted, marginLeft: 2 },
  userScoreWrap: { alignItems: 'center', marginLeft: spacing.sm },
  userScoreValue: { fontFamily: typography.display, fontSize: 18, color: colors.textPrimary },
  userScoreLabel: { fontFamily: typography.mono, fontSize: 8, color: colors.steel, letterSpacing: 1 },
  footnote: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.steel,
    lineHeight: 16,
    marginTop: spacing.xl,
  },
});
