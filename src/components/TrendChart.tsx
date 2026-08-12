import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { colors, spacing, typography, radius } from '../theme/tokens';

export type TrendPoint = { date: string; value: number };

type Props = {
  title: string;
  unit: string;
  data: TrendPoint[];
  color?: string;
  height?: number;
};

function formatDatePt(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

/**
 * Gráfico de tendência simples via react-native-svg (já usado no
 * MaverickScoreRing — sem depender de biblioteca de gráficos extra). Não é
 * um gráfico genérico: a leitura tipo "instrumento" (linha + ponto final
 * marcado + grade discreta) segue a mesma identidade visual do resto do
 * app.
 */
export function TrendChart({ title, unit, data, color = colors.ignition, height = 72 }: Props) {
  const points = data.filter((d) => d.value != null);

  if (points.length < 2) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.emptyText}>
          {points.length === 0 ? 'Sem registros ainda.' : 'Registre mais um dia pra ver a tendência.'}
        </Text>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padY = range * 0.15;
  const viewMin = min - padY;
  const viewMax = max + padY;
  const viewRange = viewMax - viewMin || 1;

  const width = 300;
  const stepX = width / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p.value - viewMin) / viewRange) * height;
    return { x, y };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const lastCoord = coords[coords.length - 1];
  const delta = last.value - first.value;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.latestValue}>
          {last.value}
          <Text style={styles.unit}>{unit}</Text>
        </Text>
      </View>

      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={colors.border} strokeWidth={1} strokeDasharray="2,4" />
        <Polyline points={polylinePoints} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={lastCoord.x} cy={lastCoord.y} r={3.5} fill={color} />
      </Svg>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>
          {formatDatePt(first.date)} – {formatDatePt(last.date)}
        </Text>
        <Text style={styles.footerText}>
          {delta === 0 ? 'estável' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${unit} no período`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.sm },
  title: { fontFamily: typography.mono, fontSize: 11, color: colors.steel, letterSpacing: 1 },
  latestValue: { fontFamily: typography.display, fontSize: 18, color: colors.textPrimary },
  unit: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  footerText: { fontFamily: typography.body, fontSize: 11, color: colors.textMuted },
  emptyText: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
});
