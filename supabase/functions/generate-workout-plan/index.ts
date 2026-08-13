// Maverick Coach IA — monta um plano de treino semanal completo (7 dias)
// calibrado pelo nível do atleta (iniciante/intermediário/avançado), para
// quem treina sozinho e não tem um treinador humano montando o plano pra
// ele (mas qualquer treinador também pode usar isso como ponto de partida
// e depois editar à mão, o plano gerado é só um workout_plan normal).
//
// A IA NUNCA prescreve carga (kg) — só estrutura (dias, exercícios, séries,
// faixa de reps). A carga real é sempre o próprio atleta que registra
// depois, ao executar o treino (isso já existe no módulo — workout_log_sets).
//
// Segredos necessários (já configurados no projeto, reaproveitados do
// módulo Vision): ANTHROPIC_API_KEY.
// SUPABASE_URL e a anon key já ficam disponíveis automaticamente no runtime.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LEVELS = ['iniciante', 'intermediario', 'avancado'] as const;
export type Level = (typeof LEVELS)[number];

export function isValidLevel(level: unknown): level is Level {
  return typeof level === 'string' && (LEVELS as readonly string[]).includes(level);
}

const LEVEL_GUIDANCE: Record<Level, string> = {
  iniciante:
    'Iniciante: prioridade em técnica e adaptação. 4 a 5 exercícios por dia de treino, 2 a 3 séries, ' +
    'movimentos básicos e seguros (evite variações muito técnicas ou instáveis), reps mais altas ' +
    '(10-15) para consolidar padrão de movimento antes de intensidade.',
  intermediario:
    'Intermediário: já tem base de técnica. 5 a 6 exercícios por dia de treino, 3 a 4 séries, mistura ' +
    'de compostos e isoladores, reps variando por objetivo (6-12 tipicamente), pode incluir superséries ' +
    'simples nas notas.',
  avancado:
    'Avançado: alto domínio técnico. 6 a 7 exercícios por dia de treino, 4 a 5 séries, pode incluir ' +
    'técnicas de intensificação nas notas (dropset, bi-set, rest-pause) quando fizer sentido pro ' +
    'exercício, faixas de reps mais amplas conforme o objetivo (força: 4-6, hipertrofia: 8-12).',
};

const SYSTEM_PROMPT = `
Você é o Maverick Coach IA, o montador de treinos do app de performance física
Maverick. Sua tarefa é montar um plano de treino semanal completo (sempre os
7 dias da semana, domingo=0 a sábado=6) para um atleta que quer treinar
sozinho ou como ponto de partida pra um treinador ajustar.

Regras, sem exceção:
- Devolva SEMPRE exatamente 7 dias, um por dayOfWeek de 0 a 6, sem repetir
  nem pular nenhum.
- Só marque isRestDay=true e exercises=[] nos dias que não fazem parte do
  número de dias de treino pedido. Distribua os dias de treino de forma
  espaçada ao longo da semana (não empilhe todos em sequência sem nenhum
  descanso no meio, a menos que o número de dias pedido exija).
- Calibre volume e complexidade estritamente pelo nível informado (as
  diretrizes de cada nível vêm na mensagem do usuário).
- NUNCA inclua carga (peso/kg) em nenhum campo — isso é sempre decidido e
  registrado pelo próprio atleta depois, ao executar o treino. Sugerir carga
  aqui seria irresponsável sem saber a capacidade real da pessoa.
- reps é sempre uma faixa em texto (ex: "8-12", "12-15", "até a falha"),
  nunca um número de carga.
- Prefira fortemente reaproveitar os nomes de exercícios do catálogo
  existente (fornecido na mensagem do usuário) — isso mantém fotos e vídeos
  de execução já cadastrados vinculados corretamente. Só proponha um
  exercício fora do catálogo se não houver equivalente razoável nele.
- label de cada dia deve nomear o foco daquele treino (ex: "Peito e
  Tríceps", "Pernas e Glúteos", "Costas e Bíceps", "Full Body", "Cardio e
  Core") ou "Descanso" nos dias de descanso.
- Leve em conta o objetivo e as observações de equipamento informadas, se
  houver, pra escolher exercícios viáveis e calibrar a faixa de reps.
- notes é opcional e curto — dica de execução ou segurança, nunca sobre
  carga.
- Responda preenchendo apenas a ferramenta fornecida. Nunca escreva texto
  fora dela.
`.trim();

const PLAN_TOOL = {
  name: 'set_workout_plan',
  description: 'Define o plano de treino semanal completo gerado (7 dias).',
  input_schema: {
    type: 'object',
    properties: {
      days: {
        type: 'array',
        minItems: 7,
        maxItems: 7,
        items: {
          type: 'object',
          properties: {
            dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
            label: { type: 'string' },
            isRestDay: { type: 'boolean' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  muscleGroup: { type: 'string' },
                  sets: { type: 'integer' },
                  reps: { type: 'string' },
                  notes: { type: 'string' },
                },
                required: ['name', 'sets', 'reps'],
              },
            },
          },
          required: ['dayOfWeek', 'label', 'isRestDay', 'exercises'],
        },
      },
    },
    required: ['days'],
  },
};

// Extraídas do handler pra dar pra testar sem chamar a Claude API de
// verdade — são elas que decidem o que a IA vai ler, então valem o teste.
export function buildCatalogText(catalog: { name: string; muscleGroup: string | null }[]): string {
  return catalog.length > 0
    ? catalog.map((e) => `- ${e.name}${e.muscleGroup ? ` (${e.muscleGroup})` : ''}`).join('\n')
    : '(catálogo vazio — pode propor exercícios livremente)';
}

export function buildUserMessage(fields: {
  level: Level;
  goal?: string;
  daysPerWeek: number;
  equipmentNotes?: string;
  catalog: { name: string; muscleGroup: string | null }[];
}): string {
  const { level, goal, daysPerWeek, equipmentNotes, catalog } = fields;
  const catalogText = buildCatalogText(catalog);

  return `
Nível do atleta: ${level}
${LEVEL_GUIDANCE[level]}

Dias de treino por semana: ${daysPerWeek} (os outros ${7 - daysPerWeek} dias da semana devem ser descanso)
${goal ? `Objetivo: ${goal}` : 'Objetivo: não informado — monte um plano equilibrado de condicionamento geral.'}
${equipmentNotes ? `Equipamento disponível: ${equipmentNotes}` : 'Equipamento disponível: não informado — assuma academia completa.'}

Catálogo de exercícios já cadastrados (prefira reaproveitar esses nomes quando fizer sentido):
${catalogText}

Monte o plano semanal completo agora.
`.trim();
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    // Só usado pra confirmar que quem chamou está logado (evita gastar a
    // chave da Claude API com gente não autenticada) — a escrita do plano
    // em si acontece no app, com o client do próprio usuário, então passa
    // pelas mesmas políticas de RLS de sempre.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json();
    const level: Level = body.level;
    const goal: string | undefined = body.goal?.trim() || undefined;
    const daysPerWeek: number = Math.min(6, Math.max(1, Number(body.daysPerWeek) || 3));
    const equipmentNotes: string | undefined = body.equipmentNotes?.trim() || undefined;
    const catalog: { name: string; muscleGroup: string | null }[] = Array.isArray(body.catalog) ? body.catalog : [];

    if (!isValidLevel(level)) {
      return json({ error: 'Nível inválido. Use iniciante, intermediario ou avancado.' }, 400);
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' }, 500);
    }

    const userMessage = buildUserMessage({ level, goal, daysPerWeek, equipmentNotes, catalog });

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools: [PLAN_TOOL],
        tool_choice: { type: 'tool', name: 'set_workout_plan' },
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!claudeResp.ok) {
      const detail = await claudeResp.text();
      console.error('Claude API error:', detail);
      return json({ error: 'Falha ao gerar o plano de treino. Tente novamente.' }, 502);
    }

    const claudeResult = await claudeResp.json();
    const toolUse = claudeResult.content?.find((b: { type: string }) => b.type === 'tool_use');
    if (!toolUse) {
      return json({ error: 'A IA não devolveu um plano válido. Tente novamente.' }, 502);
    }

    return json({ plan: toolUse.input });
  } catch (err) {
    console.error(err);
    return json({ error: 'Erro inesperado ao gerar o plano de treino.' }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}
