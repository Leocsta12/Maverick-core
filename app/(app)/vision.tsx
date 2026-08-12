import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radius } from '../../src/theme/tokens';
import { Button } from '../../src/components/Button';
import { showAlert } from '../../src/lib/alert';
import { TrendChart, TrendPoint } from '../../src/components/TrendChart';
import { HealthEntry, listHealthEntries } from '../../src/lib/health';
import {
  VisionPhoto,
  analyzeVisionPhotos,
  deleteVisionPhoto,
  listVisionPhotos,
  uploadVisionPhoto,
} from '../../src/lib/vision';

function toTrendPoints(entries: HealthEntry[], key: 'weightKg' | 'sleepHours' | 'hrvMs'): TrendPoint[] {
  return entries
    .filter((e) => e[key] != null)
    .map((e) => ({ date: e.entryDate, value: e[key] as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export default function Vision() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [photos, setPhotos] = useState<VisionPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [healthEntries, setHealthEntries] = useState<HealthEntry[]>([]);

  const loadPhotos = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [visionPhotos, entries] = await Promise.all([listVisionPhotos(user.id), listHealthEntries(user.id, 30)]);
      setPhotos(visionPhotos);
      setHealthEntries(entries);
    } catch {
      showAlert('Não foi possível carregar suas fotos.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const handleAddPhoto = async () => {
    if (!user) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Precisamos de permissão para acessar suas fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    setIsUploading(true);
    try {
      await uploadVisionPhoto(
        user.id,
        asset.uri,
        mimeType,
        new Date().toISOString().slice(0, 10)
      );
      await loadPhotos();
    } catch {
      showAlert('Não foi possível enviar a foto. Tente de novo.');
    } finally {
      setIsUploading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setAnalysis(null);
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const handleDelete = (photo: VisionPhoto) => {
    showAlert('Excluir foto?', 'Essa ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await deleteVisionPhoto(photo);
          setSelectedIds((prev) => prev.filter((id) => id !== photo.id));
          await loadPhotos();
        },
      },
    ]);
  };

  const handleAnalyze = async () => {
    if (selectedIds.length !== 2) return;
    setIsAnalyzing(true);
    setAnalysis(null);
    try {
      const sorted = [...selectedIds].sort((x, y) => {
        const dateX = photos.find((p) => p.id === x)?.takenDate ?? '';
        const dateY = photos.find((p) => p.id === y)?.takenDate ?? '';
        return dateX.localeCompare(dateY);
      });
      const result = await analyzeVisionPhotos(sorted[0], sorted[1]);
      setAnalysis(result);
    } catch {
      showAlert('Não foi possível analisar as fotos agora. Tente de novo em instantes.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const selectedPhotos = selectedIds
    .map((id) => photos.find((p) => p.id === id))
    .filter((p): p is VisionPhoto => !!p)
    .sort((a, b) => a.takenDate.localeCompare(b.takenDate));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
    >
      <Text style={styles.eyebrow}>VISION</Text>
      <Text style={styles.title}>Sua evolução</Text>

      <Text style={styles.sectionTitle}>Tendências</Text>
      <Text style={styles.hint}>Últimos 30 dias, a partir dos registros do Health.</Text>
      <TrendChart title="PESO" unit="kg" data={toTrendPoints(healthEntries, 'weightKg')} />
      <TrendChart title="SONO" unit="h" data={toTrendPoints(healthEntries, 'sleepHours')} color={colors.success} />
      <TrendChart title="HRV" unit="ms" data={toTrendPoints(healthEntries, 'hrvMs')} color={colors.steel} />

      <Text style={styles.sectionTitle}>Fotos de progresso</Text>
      <Button label="Adicionar foto" onPress={handleAddPhoto} loading={isUploading} />

      {selectedPhotos.length === 2 && (
        <View style={styles.compareCard}>
          <Text style={styles.sectionTitle}>Comparação</Text>
          <View style={styles.compareRow}>
            {selectedPhotos.map((photo) => (
              <View key={photo.id} style={styles.compareItem}>
                <Image source={{ uri: photo.publicUrl }} style={styles.compareImage} />
                <Text style={styles.photoDate}>{formatDate(photo.takenDate)}</Text>
              </View>
            ))}
          </View>
          <Button
            label="Analisar com IA"
            onPress={handleAnalyze}
            loading={isAnalyzing}
            style={{ marginTop: spacing.md }}
          />
          {analysis ? (
            <View style={styles.analysisBox}>
              <Text style={styles.analysisLabel}>ANÁLISE</Text>
              <Text style={styles.analysisText}>{analysis}</Text>
            </View>
          ) : null}
        </View>
      )}

      <Text style={styles.sectionTitle}>Suas fotos</Text>
      <Text style={styles.hint}>Toque em até 2 fotos para comparar lado a lado. Toque e segure para excluir.</Text>

      {isLoading ? (
        <Text style={styles.emptyText}>Carregando…</Text>
      ) : photos.length === 0 ? (
        <Text style={styles.emptyText}>Nenhuma foto ainda. Adicione a primeira acima.</Text>
      ) : (
        <View style={styles.grid}>
          {photos.map((photo) => {
            const isSelected = selectedIds.includes(photo.id);
            return (
              <Pressable
                key={photo.id}
                onPress={() => toggleSelect(photo.id)}
                onLongPress={() => handleDelete(photo)}
                style={[styles.thumbWrap, isSelected && styles.thumbSelected]}
              >
                <Image source={{ uri: photo.publicUrl }} style={styles.thumb} />
                <Text style={styles.photoDate}>{formatDate(photo.takenDate)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={styles.footnote}>
        Os gráficos de tendência vêm dos registros manuais em Health (peso, sono, HRV) — registre lá
        pra ver a curva aqui. A análise de fotos é gerada por IA e é qualitativa — não substitui
        avaliação física profissional nem estima métricas como percentual de gordura corporal.
      </Text>
    </ScrollView>
  );
}

const THUMB_SIZE = '31%';

const styles = StyleSheet.create({
  eyebrow: { fontFamily: typography.mono, fontSize: 11, color: colors.ignition, letterSpacing: 2 },
  title: { fontFamily: typography.display, fontSize: 24, color: colors.textPrimary, marginTop: 4, marginBottom: spacing.lg },
  sectionTitle: {
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  hint: { fontFamily: typography.body, fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },
  emptyText: { fontFamily: typography.body, fontSize: 13, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  thumbWrap: {
    width: THUMB_SIZE,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  thumbSelected: { borderColor: colors.ignition },
  thumb: { width: '100%', aspectRatio: 3 / 4, backgroundColor: colors.surface },
  photoDate: {
    fontFamily: typography.mono,
    fontSize: 10,
    color: colors.steel,
    letterSpacing: 0.5,
    marginTop: 4,
    textAlign: 'center',
  },
  compareCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  compareRow: { flexDirection: 'row', justifyContent: 'space-around', gap: spacing.md },
  compareItem: { flex: 1, alignItems: 'center' },
  compareImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  analysisBox: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
  },
  analysisLabel: { fontFamily: typography.mono, fontSize: 10, color: colors.steel, letterSpacing: 1.5, marginBottom: spacing.xs },
  analysisText: { fontFamily: typography.body, fontSize: 13, color: colors.textPrimary, lineHeight: 20 },
  footnote: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.steel,
    lineHeight: 16,
    marginTop: spacing.xl,
  },
});
