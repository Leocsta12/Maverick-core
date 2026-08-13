// Maverick Health — callback do OAuth do Strava.
//
// Rota pública (sem verificação de JWT no cabeçalho — o Strava redireciona
// o navegador pra cá diretamente, sem conseguir mandar um Authorization
// header nosso). Por isso a identidade de quem conectou vem do parâmetro
// "state": mandamos o access_token do Supabase da pessoa como state na hora
// de montar a URL de autorização (ver src/lib/strava.ts), e validamos aqui
// via supabase.auth.getUser(state) antes de gravar qualquer coisa.
//
// Segredos necessários (via `supabase secrets set`):
//   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET — strava.com/settings/api
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já vêm
// injetados automaticamente pelo runtime de toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2';

export function htmlPage(title: string, message: string): Response {
  return new Response(
    `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { background: #0D0F11; color: #F3F1EC; font-family: -apple-system, sans-serif;
      display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
    .card { max-width: 420px; text-align: center; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    p { color: #9AA1A6; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

// Exportado (em vez de passado direto pro Deno.serve) pra dar pra importar
// em testes sem precisar de um servidor de verdade — ver __tests__/index.test.ts.
export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return htmlPage('Conexão cancelada', 'Você não autorizou o acesso ao Strava. Pode fechar esta aba e tentar de novo no app, se quiser.');
  }
  if (!code || !state) {
    return htmlPage('Link inválido', 'Faltam parâmetros nessa URL. Volte ao app e tente conectar de novo.');
  }

  // Valida o "state" como um access_token de sessão do Supabase válido —
  // é assim que sabemos de quem é essa conexão.
  const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: userData, error: userError } = await anonClient.auth.getUser(state);
  if (userError || !userData.user) {
    return htmlPage('Sessão expirada', 'O link de conexão expirou. Volte ao app, entre de novo se precisar, e tente conectar o Strava outra vez.');
  }
  const userId = userData.user.id;

  const clientId = Deno.env.get('STRAVA_CLIENT_ID');
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return htmlPage('Configuração pendente', 'O app ainda não tem as credenciais do Strava configuradas no servidor.');
  }

  const tokenResp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResp.ok) {
    const detail = await tokenResp.text();
    console.error('Strava token exchange error:', detail);
    return htmlPage('Não foi possível conectar', 'O Strava recusou a troca do código de autorização. Tente conectar de novo.');
  }

  const tokenData = await tokenResp.json();
  // { access_token, refresh_token, expires_at (unix seconds), athlete: { id, ... } }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { error: upsertError } = await serviceClient.from('strava_connections').upsert(
    {
      user_id: userId,
      strava_athlete_id: tokenData.athlete?.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (upsertError) {
    console.error('Erro ao salvar conexão Strava:', upsertError);
    return htmlPage('Erro ao salvar', 'A conexão com o Strava funcionou, mas não conseguimos salvar aqui. Tente de novo.');
  }

  return htmlPage('Strava conectado! 🎉', 'Pode fechar esta aba e voltar pro Maverick Performance — suas atividades já podem ser sincronizadas.');
}

// Só sobe o servidor quando o arquivo roda como entrypoint de verdade (é
// assim que o runtime da Supabase executa) — não quando um teste importa
// esse módulo só pra pegar `handler`/`htmlPage`.
if (import.meta.main) {
  Deno.serve(handler);
}
