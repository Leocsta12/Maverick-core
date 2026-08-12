import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line, G } from 'react-native-svg';
import { colors, typography } from '../theme/tokens';

type Props = {
  score: number; // 0-100
  size?: number;
};

const TICK_COUNT = 48;

/**
 * Elemento de assinatura do produto: um mostrador tipo painel de cockpit
 * (marcas como um tacômetro) em vez de uma barra de progresso genérica.
 * Reforça a ideia de "instrumento de performance", não "app de fitness".
 */
export function MaverickScoreRing({ score, size = 220 }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const strokeWidth = 10;
  const radius = size / 2 - strokeWidth * 2.4;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference * (clamped / 100);

  const ticks = Array.from({ length: TICK_COUNT }).map((_, i) => {
    const angle = (i / TICK_COUNT) * 2 * Math.PI - Math.PI / 2;
    const isMajor = i % 4 === 0;
    const outer = size / 2 - 6;
    const inner = outer - (isMajor ? 10 : 5);
    return {
      key: `tick-${i}`,
      x1: center + outer * Math.cos(angle),
      y1: center + outer * Math.sin(angle),
      x2: center + inner * Math.cos(angle),
      y2: center + inner * Math.sin(angle),
    };
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <G>
          {ticks.map((t) => (
            <Line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={colors.border} strokeWidth={1.5} />
          ))}
        </G>
        <Circle cx={center} cy={center} r={radius} stroke={colors.surfaceElevated} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.ignition}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${progress}, ${circumference}`}
          fill="none"
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.centerContent}>
          <Text style={styles.scoreValue}>{Math.round(clamped)}</Text>
          <Text style={styles.scoreLabel}>MAVERICK SCORE</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { fontFamily: typography.display, fontSize: 56, color: colors.textPrimary },
  scoreLabel: { fontFamily: typography.mono, fontSize: 11, color: colors.steel, letterSpacing: 2, marginTop: 4 },
});
