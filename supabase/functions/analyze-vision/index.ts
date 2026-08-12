// Maverick Vision — Edge Function de análise comparativa de fotos.
//
// Recebe dois IDs de foto (já pertencentes ao usuário autenticado), baixa as
// imagens do Storage, envia pra Claude (visão) com um prompt calibrado pra
// dar feedback qualitativo e encorajador — nunca estimativas numéricas de
// composição corporal nem julgamento estético. Guarda o resultado e devolve.
//
// Segredos necessários (configurar com `supabase secrets set`):
//   ANTHROPIC_API_KEY   — console.anthropic.com
// SUPABASE_URL e a anon key já ficam disponíveis automaticamente no runtime.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `
Você é o assistente de análise visual do módulo Maverick Vision, parte de um
app de performance física. O usuário enviou duas fotos de progresso físico
tiradas em datas diferentes, para comparação.

Sua tarefa: descrever, de forma objetiva, encorajadora e educativa, as
diferenças visuais observáveis entre as duas fotos — foco em postura,
definição muscular aparente, simetria e mudanças perceptíveis de composição
corporal geral (ex: "mais definição visível no abdômen", "ombros parecem
mais largos").

Regras importantes, sem exceção:
- NUNCA estime percentual de gordura corporal, peso, IMC ou qualquer métrica
  numérica — não é possível fazer isso de forma confiável a partir de fotos e
  pode induzir a erro.
- NUNCA faça diagnósticos médicos nem comente sobre possíveis problemas de
  saúde visíveis.
- NUNCA compare o corpo da pessoa com padrões de beleza ou "corpo ideal", nem
  julgue moralmente o resultado como "bom" ou "ruim" — descreva mudanças de
  forma neutra e encorajadora.
- Se a diferença entre as fotos for pequena ou imperceptível, diga isso com
  honestidade e encoraje a consistência (progresso costuma aparecer melhor em
  janelas de tempo maiores).
- Se as fotos não parecerem fotos de progresso válidas (não mostram uma
  pessoa, ângulos/iluminação muito diferentes, resolução muito baixa), diga
  isso com gentileza e sugira como tirar a próxima foto para facilitar a
  comparação.
- Tom: personal trainer experiente e gentil, ajudando um iniciante a entender
  o próprio progresso sem gerar ansiedade em torno da aparência.
- Responda em português, em 3 a 5 frases, direto ao ponto.
`.trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { photoAId, photoBId } = await req.json();
    if (!photoAId || !photoBId) {
      return json({ error: 'Informe photoAId e photoBId.' }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    // Client "as the user" — todas as queries respeitam RLS, então o usuário
    // só consegue analisar as próprias fotos.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401);
    const userId = userData.user.id;

    const { data: photos, error: photosError } = await supabase
      .from('vision_photos')
      .select('id, storage_path, mime_type, taken_date')
      .in('id', [photoAId, photoBId]);

    if (photosError || !photos || photos.length !== 2) {
      return json({ error: 'Fotos não encontradas.' }, 404);
    }

    const photoA = photos.find((p) => p.id === photoAId)!;
    const photoB = photos.find((p) => p.id === photoBId)!;

    const [imgA, imgB] = await Promise.all([
      toBase64(supabase, photoA.storage_path),
      toBase64(supabase, photoB.storage_path),
    ]);

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' }, 500);
    }

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `Foto A — ${photoA.taken_date}:` },
              {
                type: 'image',
                source: { type: 'base64', media_type: photoA.mime_type, data: imgA },
              },
              { type: 'text', text: `Foto B — ${photoB.taken_date}:` },
              {
                type: 'image',
                source: { type: 'base64', media_type: photoB.mime_type, data: imgB },
              },
              { type: 'text', text: 'Compare essas duas fotos de progresso físico.' },
            ],
          },
        ],
      }),
    });

    if (!claudeResp.ok) {
      const detail = await claudeResp.text();
      console.error('Claude API error:', detail);
      return json({ error: 'Falha ao analisar as fotos. Tente novamente.' }, 502);
    }

    const claudeResult = await claudeResp.json();
    const analysisText =
      claudeResult.content?.find((b: { type: string }) => b.type === 'text')?.text ??
      'Não foi possível gerar uma análise desta vez.';

    await supabase.from('vision_analyses').insert({
      user_id: userId,
      photo_a_id: photoAId,
      photo_b_id: photoBId,
      analysis_text: analysisText,
    });

    return json({ analysis: analysisText });
  } catch (err) {
    console.error(err);
    return json({ error: 'Erro inesperado ao analisar as fotos.' }, 500);
  }
});

async function toBase64(
  supabase: ReturnType<typeof createClient>,
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage.from('vision-photos').download(path);
  if (error || !data) throw new Error(`Falha ao baixar imagem: ${path}`);
  const buf = await data.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}
