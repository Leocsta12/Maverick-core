import { supabase } from './supabase';

/**
 * Maverick Vision — fotos de progresso + comparação lado a lado por data.
 *
 * Fotos ficam num bucket privado do Supabase Storage, em pastas por usuário
 * ("<user_id>/<arquivo>"), com RLS garantindo que cada um só acessa as
 * próprias. A análise por IA roda numa Edge Function (analyze-vision) —
 * nunca no cliente, porque a chave da Claude API precisa ficar no servidor.
 */

export type VisionPhoto = {
  id: string;
  storagePath: string;
  mimeType: string;
  takenDate: string; // 'YYYY-MM-DD'
  publicUrl: string; // signed URL, válida por 1h
};

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function listVisionPhotos(userId: string): Promise<VisionPhoto[]> {
  const { data, error } = await supabase
    .from('vision_photos')
    .select('id, storage_path, mime_type, taken_date')
    .eq('user_id', userId)
    .order('taken_date', { ascending: false });

  if (error) throw error;

  const withUrls = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage
        .from('vision-photos')
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      return {
        id: row.id,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
        takenDate: row.taken_date,
        publicUrl: signed?.signedUrl ?? '',
      };
    })
  );

  return withUrls;
}

export async function uploadVisionPhoto(
  userId: string,
  uri: string,
  mimeType: string,
  takenDate: string
): Promise<void> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = mimeType.split('/')[1] ?? 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('vision-photos')
    .upload(path, blob, { contentType: mimeType });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('vision_photos').insert({
    user_id: userId,
    storage_path: path,
    mime_type: mimeType,
    taken_date: takenDate,
  });
  if (insertError) throw insertError;
}

export async function deleteVisionPhoto(photo: VisionPhoto): Promise<void> {
  await supabase.storage.from('vision-photos').remove([photo.storagePath]);
  await supabase.from('vision_photos').delete().eq('id', photo.id);
}

export async function analyzeVisionPhotos(photoAId: string, photoBId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('analyze-vision', {
    body: { photoAId, photoBId },
  });
  if (error) throw error;
  return data?.analysis ?? '';
}
