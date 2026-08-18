# Maverick Core

Plataforma Maverick Performance: autenticação (login/cadastro, via Supabase Auth),
dashboard com o **Maverick Score** — o elemento visual de assinatura do produto,
calculado a partir de dados reais de sono/HRV/FC/passos — e sete módulos
funcionando: **Health**, **Vision**, **Hábitos**, **Treinos**, **Nutrition**,
**Planner** e **Coach**.

Stack: **Expo SDK 57 + Expo Router + TypeScript + Supabase** (Auth, Postgres,
Storage, Edge Functions) + **Claude API** (análise de fotos em Vision).

## Rodando o projeto

Pré-requisitos: Node.js 22+ e o app **Expo Go** no celular (ou um simulador
iOS/Android configurado), mais um projeto Supabase configurado (veja abaixo).

```bash
# 1. Entre na pasta do projeto
cd maverick-core

# 2. Instale as dependências
npm install --legacy-peer-deps

# 3. Alinhe as versões nativas com o Expo SDK 57
npx expo install --fix

# 4. Configure as variáveis de ambiente (veja "Configuração" abaixo)
cp .env.example .env.local
# preencha EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY

# 5. Inicie o servidor de desenvolvimento
npx expo start
```

Pra rodar o typecheck e os testes (não exigem Supabase configurado — ver
"Testes e CI" abaixo):

```bash
npm run lint    # tsc --noEmit
npm test        # jest
```

Depois do `expo start`, escaneie o QR code com o app **Expo Go** (Android) ou a
câmera (iOS), ou pressione `i` / `a` no terminal para abrir num simulador, ou
`w` para abrir no navegador.

> `--legacy-peer-deps` é necessário por um conflito de versão entre `react` e
> `react-dom` que o Expo puxa internamente — não afeta o funcionamento do app.

## Configuração (Supabase + Claude API)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode o conteúdo inteiro de [`supabase/schema.sql`](supabase/schema.sql)
   — idempotente, pode rodar de novo sem duplicar nada.
3. Confirmação de e-mail já vem **ligada** por padrão no Supabase (e é o que
   este projeto espera — veja "Autenticação" abaixo). Só desmarque **Confirm
   email** em Authentication > Providers > Email se quiser voltar ao cadastro
   instantâneo pra testes locais.
4. Em **Settings > API**, copie a **Project URL** e a **anon/public key** para
   `.env.local` (nunca a `service_role key`).
5. Para o módulo **Vision** (análise de fotos por IA), publique a Edge Function
   e configure o segredo da Claude API:
   ```bash
   npx supabase functions deploy analyze-vision --project-ref <seu-ref>
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <seu-ref>
   ```
   A chave vem de [console.anthropic.com](https://console.anthropic.com) e
   **nunca** deve entrar no código do app — só nesse segredo da Edge Function.
6. Para o módulo **Health > Atividades** (integração real com o Strava):
   1. Crie um app em [strava.com/settings/api](https://www.strava.com/settings/api).
      Em **Authorization Callback Domain**, use exatamente o domínio do seu
      projeto Supabase (ex: `SEU-PROJETO.supabase.co`, sem `https://` nem
      barra no final).
   2. Publique as duas Edge Functions e configure os segredos:
      ```bash
      npx supabase functions deploy strava-oauth-callback --project-ref <seu-ref> --no-verify-jwt
      npx supabase functions deploy strava-sync --project-ref <seu-ref>
      npx supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... --project-ref <seu-ref>
      ```
      `--no-verify-jwt` na primeira é necessário porque o Strava chama esse
      endpoint direto (sem conseguir mandar um header de autenticação nosso).
   3. Adicione `EXPO_PUBLIC_STRAVA_CLIENT_ID` (mesmo valor do Client ID, é
      público por design em qualquer OAuth) no `.env.local`.
   4. (Opcional) Sincronização automática, sem precisar tocar no botão
      "Sincronizar": publique `strava-sync-all` e configure um segredo
      qualquer (gerado por você, não é do Strava) que só essa função e o
      workflow do GitHub Actions vão conhecer:
      ```bash
      npx supabase functions deploy strava-sync-all --project-ref <seu-ref> --no-verify-jwt
      npx supabase secrets set CRON_SECRET=$(openssl rand -hex 32) --project-ref <seu-ref>
      ```
      Depois, em **Settings → Secrets and variables → Actions** no GitHub,
      crie um secret `STRAVA_CRON_SECRET` com o **mesmo valor** — é o que
      [`.github/workflows/strava-auto-sync.yml`](.github/workflows/strava-auto-sync.yml)
      manda no header `x-cron-secret` a cada 6h (`workflow_dispatch` também
      deixa rodar na mão, pela aba Actions). Sem esse secret configurado, o
      workflow roda mas a função recusa (401) — nada quebra, só não
      sincroniza sozinho.
7. Para o **Maverick Coach IA** (geração de treino por IA em Treinos), publique
   a Edge Function — reaproveita o mesmo segredo `ANTHROPIC_API_KEY` já
   configurado no passo 5, não precisa configurar de novo:
   ```bash
   npx supabase functions deploy generate-workout-plan --project-ref <seu-ref>
   ```
8. **Nutrition** não precisa de nenhum segredo novo — é só schema (tabelas
   `nutrition_meals`, `nutrition_water_logs`, `nutrition_goals`) já incluído
   no passo 2.
9. **Monitoramento** (opcional — [`src/lib/monitoring.ts`](src/lib/monitoring.ts)):
   sem esse passo o app roda normal, só sem relatório de erro nem analytics.
   1. **Sentry** (erro): crie um projeto React Native em
      [sentry.io](https://sentry.io), copie o DSN em **Settings → Client
      Keys (DSN)**, e coloque em `EXPO_PUBLIC_SENTRY_DSN` no `.env.local`.
   2. **PostHog** (analytics de produto): crie um projeto em
      [posthog.com](https://posthog.com) (ou `eu.posthog.com`, se a região
      escolhida for EU), copie a **Project API Key** em **Project
      Settings**, e coloque em `EXPO_PUBLIC_POSTHOG_API_KEY` no
      `.env.local` (`EXPO_PUBLIC_POSTHOG_HOST` só muda se o projeto for na
      região EU — padrão já é US).
   3. As duas chaves são públicas por design (mesmo espírito da anon key do
      Supabase — só recebem eventos, não dão acesso a nada) — mesmo assim,
      **nunca** vão no código do app: sempre no `.env.local`.

## Deploy (versão web)

O jeito mais rápido de ter um link público é publicar a versão web (mesmo
código, mesmo backend — o app é o mesmo, só o empacotamento muda). Build
nativo pra loja de verdade (App Store/Play Store) é um passo à parte, mais
adiante — precisa de conta de desenvolvedor Apple/Google, ícone/splash
screen, e `eas build`, nenhum desses ainda configurado aqui.

**Vercel** — [`vercel.json`](vercel.json) já traz a configuração:
1. Em [vercel.com](https://vercel.com), **Add New → Project**, conecte o
   repositório `Leocsta12/Maverick-core` do GitHub (mesma conta que já usa
   pra CI). Framework preset pode ficar em "Other" — o `vercel.json` já diz
   o comando de build (`npm run build`, que roda `expo export -p web`), o
   de instalação (`npm install --legacy-peer-deps`, mesmo motivo do CI) e
   onde fica o resultado (`dist/`).
2. Em **Settings → Environment Variables**, adicione as mesmas variáveis do
   `.env.local` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
   `EXPO_PUBLIC_STRAVA_CLIENT_ID`, e as de Monitoramento se já tiver criado
   as contas) — o build da Vercel não tem acesso ao seu `.env.local`
   (gitignored de propósito), precisa configurar lá também. São todas
   `EXPO_PUBLIC_*`, ou seja, já são públicas por design — mesmo assim, só
   nesse painel, nunca commitadas.
3. Cada push na `main` publica sozinho (mesmo esquema do CI). O output é
   uma SPA (`"web": {"output": "single"}` no `app.json`) — o `rewrites` do
   `vercel.json` manda qualquer rota (`/nutrition`, `/coach`, etc.) pro
   `index.html`, senão um link direto pra uma tela interna dá 404.

Testado localmente antes de documentar: `npm run build` gera `dist/`,
servido com fallback de SPA (`npx serve -s dist`), a tela de login carrega
sem nenhum erro no console e as rotas internas respondem 200 direto (não
só navegando pelo app).

## Autenticação

- **Cadastro** exige confirmação de e-mail: a conta é criada, mas o login só
  funciona depois de clicar no link enviado. A tela de cadastro mostra
  "Confira seu e-mail" nesse meio-tempo (não é erro).
- **Login com e-mail não confirmado** mostra a mensagem certa e um botão
  "Reenviar e-mail de confirmação".
- **Esqueci minha senha** (`/forgot-password`): envia link de recuperação via
  `supabase.auth.resetPasswordForEmail`. O link leva pra `/reset-password`
  — essa tela fica **fora** dos grupos `(auth)`/`(app)` de propósito, porque
  o link autentica a pessoa numa sessão temporária pra provar que ela é dona
  do e-mail, e o layout de `(auth)` redirecionaria pro dashboard antes dela
  poder trocar a senha.
- ⚠️ **O serviço de e-mail padrão do Supabase tem um rate limit bem baixo**
  (poucos e-mails por hora) — já travou teste ao vivo aqui mais de uma vez.
  Ótimo pra testar, **não serve nem pra um grupo pequeno de gente real**.
  Escolhido **[Resend](https://resend.com)** como provedor — configure antes
  de mandar o link pra qualquer pessoa de fora:
  1. Crie a conta em resend.com, gere uma API key em **API Keys**.
  2. Adicione e verifique um domínio em **Domains** (registros DNS que o
     próprio Resend mostra) — sem domínio verificado, o Resend só entrega
     pro e-mail dono da conta, não serve pra convidar ninguém.
  3. No painel do Supabase: **Authentication → Settings → SMTP Settings**,
     ligue "Enable Custom SMTP" com host `smtp.resend.com`, porta `465`,
     usuário `resend`, senha = a API key gerada no passo 1, e o e-mail de
     remetente usando o domínio verificado (ex: `no-reply@seudominio.com`).

## Segurança

Revisão das policies de RLS (`supabase/schema.sql`) antes de abrir o app pra
gente de fora — achado real, corrigido e testado ao vivo:

> **A policy de UPDATE em `coach_links`** (responder um pedido de vínculo)
> só exigia, no `WITH CHECK`, que o `status` final fosse `accepted`/
> `rejected` — sem travar `coach_id`/`athlete_id`/`requested_by`. RLS não
> compara a linha antes/depois numa mesma cláusula (`USING` vê a linha
> antiga, `WITH CHECK` vê só a nova), então nada impedia alguém que é parte
> de **qualquer** vínculo pendente (inclusive um provocado com uma segunda
> conta própria) de, numa chamada direta à API por fora do app, trocar
> `athlete_id`/`coach_id` pra apontar pra outra pessoa e já mandar
> `status='accepted'` junto — criando um vínculo de treinador sem
> consentimento real da vítima, com acesso de leitura a Health, Nutrition,
> Vision e Treinos dela. Corrigido com um trigger (`before update`) que
> barra qualquer mudança nessas três colunas, já que RLS sozinha não
> consegue expressar "essa coluna não muda depois de criada". **Testado ao
> vivo com três contas descartáveis** (atacante, requerente, vítima): a
> tentativa de redirecionar o vínculo foi bloqueada
> (`COACH_LINK_IDENTIDADE_IMUTAVEL`), o fluxo normal de aceitar (só o
> `status` muda) continuou funcionando, e a vítima ficou com zero vínculos
> — confirmado direto no banco. Contas de teste removidas depois.
>
> As outras policies com `FOR ALL` + `WITH CHECK` do projeto (workout_plans,
> workout_plan_days/exercises, nutrition_*, mission_*) não têm essa falha:
> nelas, o `WITH CHECK` sempre re-deriva a autorização a partir da própria
> coluna que poderia ser adulterada (ex: tentar trocar `user_id` só passa
> se o *novo* valor também satisfizer "é meu ou sou treinador aceito dele")
> — a coluna pode mudar, mas só pra outro valor igualmente autorizado. Em
> `coach_links` o `WITH CHECK` checava uma coisa (status) sem nenhuma
> relação com as colunas de identidade, que é o que tornava a lacuna
> possível.

### Painel de Admin

Visão só-leitura de todos os usuários (`app/(app)/admin.tsx`), pra suporte
e acompanhamento geral — **não** é um papel de usuário como Coach, que
exige vínculo aceito por consentimento mútuo. Design deliberado pra não
reabrir o mesmo tipo de furo que o achado do `coach_links` acima:

- **`app_admins`** é uma tabela sem nenhuma policy de INSERT/UPDATE/DELETE
  pro papel `authenticated` — mesmo raciocínio de `strava_connections`. Só
  vira admin por uma ação direta no banco (SQL Editor ou API de
  management), nunca pelo próprio app. Sem isso, o mesmo furo de
  auto-conceder acesso via chamada direta à API seria trivial de
  reproduzir aqui — só que pra **todos** os dados de **todo mundo**, não
  um vínculo só.
- **Só leitura de verdade, não só na UI**: existe uma policy extra de
  `SELECT` por tabela (`is_app_admin()`, mesmo padrão de `checkInStatus`
  "as coach") em profiles, Health, Nutrition, Treinos, Hábitos e Vision —
  nunca uma policy de `INSERT`/`UPDATE`/`DELETE`. A tela reusa
  `AthleteDetail` de `coach.tsx` com `canEdit={false}` (esconde os
  controles de montar treino), mas a trava de verdade é a RLS: mesmo que a
  UI liberasse escrita, o banco recusaria — não tem policy nenhuma pra
  isso. `strava_connections` (tokens OAuth) fica de fora, igual já fica
  pro Coach.
- `am_i_admin()` (RPC `security definer`) devolve só um boolean — o
  cliente nunca consegue listar quem mais é admin.

**Testado ao vivo com duas contas descartáveis**: uma sem entrada em
`app_admins` recebeu "Sem acesso" na tela e, testado direto contra a API
(sem passar pela UI), só enxergou a própria linha em `profiles` — a trava
é da RLS, não só da tela. A outra, com a entrada, viu a lista completa de
usuários reais (confirmado `Content-Range: 0-6/7` numa chamada REST
direta) e o detalhe de cada um; ao abrir o detalhe de uma conta que **não**
era a própria, o botão "Marcar treino como concluído" nem apareceu — sem
risco de escrita acidental em dado de outra pessoa. Contas de teste
removidas depois, sobrando só a conta real do dono do projeto em
`app_admins`.

## Estrutura

```
app/
  _layout.tsx              # carrega fontes, provider de auth, status bar, <AlertHost/>
  index.tsx                 # redireciona para /login ou /dashboard
  (auth)/
    login.tsx
    signup.tsx
    forgot-password.tsx      # pede o link de recuperação
  reset-password.tsx        # fora dos grupos — ver "Autenticação" abaixo
  (app)/
    _layout.tsx              # abas visíveis: Painel / Treinos / Health / Nutrition / Mais
    dashboard.tsx             # Mission Control: Score + Daily Brief + treino/nutrição de hoje
    health.tsx                # registro manual de sono/HRV/FC/passos + histórico
    vision.tsx                 # fotos de progresso + comparação lado a lado + análise IA (fora da tabBar, ver Mais)
    mission.tsx                # Hábitos: checklist diário com sequência (fora da tabBar, ver Mais)
    treinos.tsx                # plano semanal de treino do próprio atleta (usa WorkoutWeek)
    nutrition.tsx               # refeições, água e metas diárias
    coach.tsx                  # vínculo treinador↔atleta + painel agregado por atleta (exporta AthleteDetail, reusado em admin.tsx)
    admin.tsx                   # todos os usuários, só leitura — visível só pra quem está em app_admins (fora da tabBar, ver Mais)
    profile.tsx                # fora da tabBar, ver Mais
    planner.tsx                 # semana unificada: treino + nutrição + recuperação por dia (fora da tabBar, ver Mais)
    mais.tsx                   # menu com Planner / Hábitos / Vision / Coach / Perfil / Sair (+ Admin, condicional)
src/
  components/                # Button, TextField, MaverickScoreRing, ModuleCard, WorkoutWeek, TrendChart, OfflineBanner
    __tests__/                 # testes de componente (Fase 2 — ver "Testes e CI")
  __tests__/screens/          # testes de tela (fora de app/ de propósito — expo-router
                               # escaneia app/ pra rotas, um __tests__ lá dentro confundiria)
  context/AuthContext.tsx     # autenticação via Supabase Auth
  theme/tokens.ts             # cores, tipografia, espaçamento — a identidade visual
  lib/
    supabase.ts               # client do Supabase
    storage.ts                 # wrapper sobre AsyncStorage
    offlineCache.ts             # cache local "read-through" (Offline Fase 1 — leitura)
    offlineSync.ts               # fila de escrita persistida (Offline Fase 2 — escrita)
    alert.tsx                  # showAlert + <AlertHost/> — substitui Alert.alert (no-op no web)
    health.ts                  # dados + cálculo do Maverick Score
    missionControl.ts           # compõe o Daily Brief do Painel (Score + treino + nutrição de hoje)
    coachOverview.ts             # compõe score + check-in de cada atleta no painel do Coach
    vision.ts                  # upload/listagem de fotos + chamada à análise IA
    mission.ts                 # hábitos, conclusões e cálculo de streak
    nutrition.ts                # refeições, água, metas diárias e totais do dia
    coach.ts                   # código de vínculo, pedidos, listagem de atletas/treinadores
    admin.ts                    # isAppAdmin (RPC am_i_admin), listAllUsers — painel de Admin
    strava.ts                  # URL de autorização, status, sincronização, formatação
    workouts.ts                # plano semanal, catálogo de exercícios, registro de séries, geração por IA
supabase/
  schema.sql                  # schema completo (tabelas, RLS, bucket de Storage)
  functions/                  # cada uma exporta `handler` (+ helpers puros) e só
                               # sobe Deno.serve se `import.meta.main` — ver "Testes e CI"
    _shared/
      stravaSync.ts             # syncStravaForUser, toActivityRow, needsTokenRefresh — usado por
                                 # strava-sync (sob demanda) e strava-sync-all (cron), não é deployado
      __tests__/stravaSync.test.ts  # Deno test — toActivityRow, needsTokenRefresh
    analyze-vision/            # Edge Function que chama a Claude API (visão)
      __tests__/index.test.ts    # Deno test — toBase64, json, ramos do handler sem I/O
    strava-oauth-callback/      # troca o code do Strava por tokens, salva a conexão
      __tests__/index.test.ts    # Deno test — htmlPage, ramos do handler sem I/O
    strava-sync/                 # busca atividades recentes e grava em strava_activities (sob demanda, JWT do usuário)
      __tests__/index.test.ts    # Deno test — re-exports de _shared, ramos do handler
    strava-sync-all/             # mesma sincronização, pra todo mundo — chamada pelo cron (segredo compartilhado, não JWT)
      __tests__/index.test.ts    # Deno test — portão de autenticação (x-cron-secret)
    generate-workout-plan/        # Edge Function que chama a Claude API (Maverick Coach IA)
      __tests__/index.test.ts      # Deno test — buildUserMessage, isValidLevel, ramos do handler
.github/
  workflows/ci.yml               # typecheck + testes JS a cada push/PR, + job separado de testes Deno
  workflows/strava-auto-sync.yml # chama strava-sync-all a cada 6h (cron do GitHub Actions)
jest.config.js                   # preset jest-expo, setup, testMatch (ignora supabase/functions/)
jest.setup.js                    # env falso do Supabase + mock do AsyncStorage pros testes
```

## Navegação

A barra inferior mostra só 5 abas (Painel, Treinos, Health, Nutrition, Mais) —
as menos usadas no dia a dia (Hábitos, Vision, Coach, Perfil) viraram itens
dentro de **Mais**, pra não apertar a barra em telas de celular menores.
Continuam sendo rotas normais (Expo Router `href: null` só tira da tabBar, a
tela segue navegável), só mudou onde o atalho mora. O módulo de hábitos
(`mission.tsx`) foi renomeado de "Mission" pra "Hábitos" na UI — o nome
"Mission" colidia com "Mission Control", como a tela inicial é chamada na
visão de produto (ver análise de plataforma).

## Offline

**Treinos**, **Health** e **Nutrition** funcionam sem internet. Vision,
Coach e Hábitos ainda exigem conexão pra tudo.

**Fase 1 (leitura)** — padrão "cache read-through" em
[`src/lib/offlineCache.ts`](src/lib/offlineCache.ts): `loadWithCache(chave,
fetcher)` tenta buscar do Supabase e, se der certo, salva no `AsyncStorage`
pra próxima vez; se a busca falhar (sem sinal, ou qualquer erro de rede) e
existir algo salvo antes, devolve o cache em vez de quebrar a tela — e
mostra o aviso `<OfflineBanner/>` com o horário do último dado salvo.

**Fase 2 (escrita)** — [`src/lib/offlineSync.ts`](src/lib/offlineSync.ts):
fila persistida no `AsyncStorage`. Quando uma escrita falha por falta de
conexão, em vez de mostrar erro, a intenção fica guardada
(`upsertHealthEntryOffline`, `markDayDoneOffline`, `markDayUndoneOffline`,
`addMealOffline`, `addWaterOffline`) e a tela atualiza o próprio estado
local na hora (otimista — "salvo no aparelho, sincroniza sozinho depois").
A fila sai sozinha (`flushOfflineQueue`) em três momentos: ao abrir o app
com sessão ativa (`OfflineSyncOnStart` em `app/_layout.tsx`), e depois de
qualquer carregamento de Health/Treinos/Nutrition que confirme que a rede
voltou. Escritas repetidas pro mesmo alvo (ex: marcar e desmarcar o mesmo
dia offline, ou registrar o mesmo dia de Health duas vezes) substituem a
pendência anterior em vez de empilhar — só o estado final desejado importa.
Refeição e água são diferentes: cada registro é independente (a pessoa pode
comer duas coisas offline), então **empilham** em vez de substituir. Mesmo
espírito da Fase 1: editar/remover coisas já salvas (deletar refeição,
desfazer água, editar metas) continua só online, e fluxos que dependem de
resposta da rede pra fazer sentido (gerar treino por IA, analisar fotos)
não são enfileiráveis.

Mais de uma tela pode chamar `flushOfflineQueue()` quase ao mesmo tempo (o
`OfflineSyncOnStart` do app inteiro, e o `load()` de cada tela) — sem
cuidado, duas chamadas concorrentes leem a mesma fila antes de qualquer uma
escrever de volta, e cada uma sincroniza os mesmos itens de novo. Isso foi
pego durante o teste do offline de Nutrition (refeição/água duplicada de
verdade no banco — Health/Treinos não sofriam disso na prática porque
`upsertHealthEntry`/`markDayDone` são idempotentes, mas `addMeal`/
`addWater` são inserts puros). Corrigido com uma trava em memória
(`flushOfflineQueue` compartilha a mesma promise entre chamadas
concorrentes) e removendo cada item da fila persistida *antes* de tentar
sincronizar, não só no final — encolhe a janela de corrida pra "ler +
escrever um item" em vez de "processar a fila inteira". Testado com duas
chamadas concorrentes de verdade em
[`offlineSync.test.ts`](src/lib/__tests__/offlineSync.test.ts).

Testado simulando perda de rede de verdade (bloqueando as chamadas
`/rest/v1/` do Supabase no navegador, mantendo `/auth/v1/` liberado pra não
travar o login): com o cache já populado, as telas continuaram mostrando os
dados certos com o aviso de offline; sem cache pra aquele dado específico
(ex: um dia do plano nunca aberto antes), o app mostra um erro amigável em
vez de travar; registrar um dia novo de Health, marcar um treino como
concluído e registrar refeição/água **offline** atualizaram a tela na hora
(com o aviso de "N registros aguardando conexão"), e ao restaurar a rede e
recarregar, a fila sumiu sozinha — confirmado direto no banco que tudo
chegou (`health_entries`, `workout_logs`, `nutrition_meals`,
`nutrition_water_logs`) com os valores exatos registrados offline.

## Nota técnica: Alert no web

`Alert.alert` do React Native **não faz nada no react-native-web** (é um
no-op silencioso — dá pra conferir em
`node_modules/react-native-web/src/exports/Alert`). Isso quebrava toda
mensagem de erro/sucesso e toda confirmação do app quando rodando no
navegador (`w` no `expo start`), embora funcionasse normalmente em
iOS/Android via Expo Go. Corrigido com [`src/lib/alert.tsx`](src/lib/alert.tsx):
`showAlert(title, message?, buttons?)` é um substituto direto (mesma
assinatura) que, no web, renderiza um modal próprio via `<AlertHost/>`
(montado uma vez em `app/_layout.tsx`); fora do web, chama o `Alert.alert`
nativo de sempre. Todo o app já usa `showAlert` no lugar de `Alert.alert`.

## Monitoramento

[Sentry](https://sentry.io) (erro) + [PostHog](https://posthog.com) (analytics de
produto), os dois opcionais — ver [`src/lib/monitoring.ts`](src/lib/monitoring.ts)
e o passo 9 de "Configuração" acima. Sem as chaves configuradas, tudo vira
no-op silencioso (mesmo espírito de `isStravaConfigured()`): o app roda
normal em dev/CI sem precisar de conta em nenhum dos dois, diferente de
`supabase.ts`, que é obrigatório e lança erro sem as env vars.

- **`Sentry.GlobalErrorBoundary`** (`app/_layout.tsx`) captura qualquer
  erro de render que travaria a tela — mostra um fallback simples ("Tentar
  de novo") em vez de tela branca, e manda o erro pro Sentry antes disso
  (se configurado). `initSentry()` roda o quanto antes possível, antes de
  qualquer outro módulo poder lançar um erro durante o boot.
- **`identifyUser`/`resetUser`** ligam/desligam a identificação da conta
  junto com login/logout (`MonitoringOnAuthChange` em `app/_layout.tsx`) —
  sem isso, todo evento e erro capturado ficaria anônimo.
- **`trackScreenView`** manda um evento por troca de rota
  (`ScreenViewTracker`, via `usePathname()` do expo-router) — a métrica
  mais básica de analytics de produto, sem precisar instrumentar tela por
  tela.
- **`captureError`/`trackEvent`** ficam disponíveis pra uso pontual (ex:
  marcar um evento de produto relevante como "treino concluído", ou
  capturar um erro específico com mais contexto do que o boundary global
  pega sozinho) — ainda não espalhados pelas telas, é o próximo passo
  natural depois que as contas estiverem criadas e o volume de eventos
  fizer sentido olhar.

> `npm install` avisa que dois scripts de postinstall do `@sentry/cli`
> ficaram bloqueados (`npm warn allow-scripts`) — de propósito, não
> rodamos script de instalação de pacote sem revisar antes. Isso não afeta
> nada do que está descrito aqui (captura de erro via SDK funciona sem o
> CLI); ele só seria necessário mais pra frente, pra enviar source maps
> num build de produção de verdade (facilita ler o stack trace de um erro
> minificado). Se/quando isso for necessário, revise o script antes de
> rodar `npm approve-scripts @sentry/cli` (ver aviso do próprio npm).

## Testes e CI

`jest` + `jest-expo` (o preset oficial da Expo, já traz os mocks de módulo
nativo prontos). **Fase 1** — testes de unidade sobre lógica pura em
`src/lib/*.ts`: cálculo do Maverick Score, streak de hábitos, totais de
nutrição, status de check-in do Coach, composição do Daily Brief, o cache
offline, o monitoramento (Sentry/PostHog no-op sem as chaves — ver
"Monitoramento" acima) e `isAppAdmin` (fail-closed em erro — ver
"Segurança" acima). **Fase 2** — testes de componente e de tela com
`@testing-library/react-native` (`^13`, não a `14` — ver nota abaixo):
`Button`, `TextField`, `ModuleCard`, `OfflineBanner` e `TrendChart` como
componentes isolados, e três telas inteiras — **Perfil**
(`app/(app)/profile.tsx`, só mocka `useAuth`), **Hábitos**
(`app/(app)/mission.tsx`) e **Nutrition** (`app/(app)/nutrition.tsx`, essa
mockando só `src/lib/nutrition.ts` e deixando `offlineCache`/`offlineSync`
rodarem de verdade por cima — cobre a integração da tela com o offline,
não só o caminho feliz) — como prova de que dá pra testar uma tela real:
render, carregar, marcar/adicionar, e o que acontece quando a escrita
falha. 115 testes, 17 suítes (JS/RN — ver também "Edge Functions (Deno)"
abaixo).

> **`@testing-library/react-native` 14 não funciona neste projeto ainda**: a
> v14 trocou o motor de teste de `react-test-renderer` (que já usamos, via
> `jest-expo`) pro pacote novo `test-renderer`, feito pra New Architecture —
> e não achei esse pacote publicado de forma compatível com o que o Expo SDK
> 57 já traz. Fica em `^13.3.3`, que ainda usa `react-test-renderer` (mesmo
> motor do resto do setup) até isso amadurecer.
>
> **Pegadinha real #2**: `fireEvent.press` da RTL sobe a árvore de teste
> procurando uma prop `onPress` em QUALQUER ancestral — inclusive no próprio
> componente React (não só no `Pressable` real), então simular um toque não
> prova que um botão "bloqueado" internamente decidiu não usar o `onPress`
> que recebeu. E `getByTestId` resolve pro elemento nativo (host), que não
> tem uma prop `disabled` — isso vira `accessibilityState.disabled`. As duas
> coisas só apareceram rodando de verdade; os testes de `Button`/`ModuleCard`
> documentam a solução (ver comentários nos arquivos).

```bash
npm test              # roda tudo uma vez
npm test -- --watch   # modo watch, roda de novo a cada salvamento
```

Os testes **não precisam de Supabase configurado** — `jest.setup.js` define
um `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` falso só pra permitir os módulos
carregarem (`src/lib/supabase.ts` lança erro no import se não estiverem
definidos), e mocka `AsyncStorage` com o mock oficial do próprio pacote. É
por isso que dá pra rodar em CI sem segredo nenhum.

**CI** (`.github/workflows/ci.yml`): a cada push/PR pra `main`, roda
`npm run lint` (typecheck) e `npm test`. No ar em
[github.com/Leocsta12/Maverick-core](https://github.com/Leocsta12/Maverick-core) — [primeiro run verde ✅](https://github.com/Leocsta12/Maverick-core/actions).

> **Pegadinha real que aconteceu aqui**: o primeiro push falhou no CI — `jest-expo`
> depende de `@react-native/jest-preset`, que por acaso já estava no
> `node_modules` local (resquício de uma instalação anterior) mas nunca tinha
> sido declarado no `package.json` nem travado no `package-lock.json`. Rodava
> local, quebrava no CI, porque o CI faz `npm install` do zero, sem esse
> resquício. Corrigido declarando a dependência explicitamente — reproduzido
> localmente clonando o repo do zero antes de confiar que o fix funcionava.

### Edge Functions (Deno)

As 5 Edge Functions (`supabase/functions/*`, mais `_shared/` — lógica
compartilhada, não deployada) têm sua própria suíte, em Deno — outro
runtime, fora do Jest de propósito (`jest.config.js` ignora
`/supabase/functions/` explicitamente pra nunca confundir os dois). 37
testes, mesma filosofia da Fase 1 do Jest: lógica pura extraída do handler
primeiro — `toActivityRow`/`needsTokenRefresh` (`_shared/stravaSync.ts`,
usada por strava-sync e strava-sync-all), `buildUserMessage`/`isValidLevel`
(generate-workout-plan), `htmlPage` (strava-oauth-callback), `toBase64`
(analyze-vision) — mais os ramos do handler que retornam **antes** de
precisar de Supabase/Claude/Strava de verdade (CORS, autenticação,
segredo do cron, validação de entrada). O que exige uma API externa de
verdade (trocar código OAuth por token, chamar a Claude, chamar o Strava)
fica de fora — não dá pra testar isso sem gastar chamada real.

```bash
# instala o Deno (uma vez): irm https://deno.land/install.ps1 | iex  (PowerShell/Windows)
deno test --allow-net --allow-env --node-modules-dir=none --min-dep-age=0 \
  supabase/functions/_shared \
  supabase/functions/strava-oauth-callback \
  supabase/functions/strava-sync \
  supabase/functions/strava-sync-all \
  supabase/functions/generate-workout-plan \
  supabase/functions/analyze-vision
```

> **Pegadinha real #3**: o Deno lê o `package.json` da raiz do repo (do
> app Expo — ecossistema totalmente separado, nenhuma Edge Function
> importa nada de lá) e tenta validar **todas** as dependências dele
> contra a política de "idade mínima de dependência" (bloqueia por padrão
> qualquer versão publicada há menos de 24h). Isso já derrubou o job do
> Deno duas vezes — não por causa de nada relacionado às Edge Functions,
> mas porque o app instalou um pacote (Sentry/PostHog) recém-publicado.
> Tentei isolar com um `deno.json`/`package.json` vazio dentro de
> `supabase/functions/` (não funcionou — o Deno continua achando o
> `package.json` da raiz) antes de aceitar `--min-dep-age=0` como a
> correção de verdade: essa política nunca protegia nada que o Deno
> realmente executa aqui, já que os pacotes bloqueados nem são importados
> pelas Edge Functions.

> **Pra isso funcionar, os 4 `index.ts` precisaram de um pequeno refactor**
> (comportamento idêntico, só reorganização): cada um tinha um handler
> anônimo direto em `Deno.serve(async (req) => {...})`, impossível de
> importar num teste. Viraram `export async function handler(req)` +
> `if (import.meta.main) { Deno.serve(handler); }` — só sobe o servidor
> quando o arquivo roda como entrypoint de verdade (é assim que a Supabase
> executa em produção), não quando um teste importa o módulo só pelas
> funções exportadas. Redeployado e testado ao vivo depois do refactor —
> nenhuma mudança de comportamento.
>
> **`--node-modules-dir=none` é obrigatório aqui**: o Deno detecta o
> `package.json` do projeto Expo (que fica ao lado, no mesmo repo) e tenta
> resolver os pacotes npm do `supabase-js` contra esse `node_modules` —
> que não tem esses pacotes, porque são dois ecossistemas completamente
> separados. Essa flag força o Deno a usar o cache dele próprio.

CI: job separado (`deno-tests`, via `denoland/setup-deno`) roda em
paralelo ao `typecheck-and-test` a cada push/PR.

## Identidade visual

Definida em `src/theme/tokens.ts`: base grafite (não preto puro), um único
acento "ignição" em laranja para ações e dados de alta intensidade, tipografia
Space Grotesk (display) + Inter (corpo) + JetBrains Mono (leituras tipo
instrumento). O `MaverickScoreRing` é o elemento de assinatura — um mostrador
com marcações, não uma barra de progresso genérica.

## Módulos

- **Painel (Mission Control)** — a tela inicial. Além do Maverick Score, traz
  um **Daily Brief** que combina o insight de recuperação (Health) com o
  treino e a nutrição do dia (Treinos/Nutrition) — sempre tentando terminar
  com **uma** próxima ação concreta (ex: "seu treino de hoje ainda não foi
  feito — 6 exercícios te esperando"), nunca uma lista de pendências, pra não
  virar ruído (Simplicity First). É lógica pura em
  [`src/lib/missionControl.ts`](src/lib/missionControl.ts) — hoje é regra
  determinística, dá pra trocar por um resumo gerado por IA depois sem mexer
  na tela. Dois cards mostram o resumo de hoje (treino: dia/exercícios/
  concluído; nutrição: água e calorias vs. metas) com atalho direto pro
  módulo. Chamava-se "Painel"; o nome interno/visual virou "Mission Control"
  porque é isso que a tela já faz — o módulo de hábitos que usava esse nome
  antes foi renomeado pra "Hábitos" (ver "Navegação" abaixo).
- **Health** — registro manual de sono, HRV, FC de repouso, passos, peso e
  % de gordura (opcional). O Maverick Score é calculado a partir dos
  quatro primeiros (sono 35%, HRV 30%, FC de repouso 20%, passos 15%, com
  linha de base pessoal pros sinais fisiológicos) — peso e % de gordura
  não entram no Score (propósito diferente: alimentam os gráficos de
  tendência em Vision, não a leitura de recuperação do dia). Tem também
  **integração real com o Strava** (seção "Atividades"): conecta via OAuth,
  sincroniza corridas/pedais/natação/etc. — pelo botão "Sincronizar" (sob
  demanda) ou sozinho, a cada 6h, via `strava-sync-all` chamada pelo cron
  do GitHub Actions (opcional, ver "Configuração" > passo 6.4). Os tokens
  do Strava nunca ficam legíveis pelo app nem pelo dono da conta — só as
  Edge Functions, via `service_role`, os tocam. Integração com Garmin
  (aguardando aprovação do Developer Program) e Apple HealthKit (precisa de
  build nativo) seguem como próximos passos, escrevendo na mesma
  `health_entries`.
- **Vision (Evolução)** — fotos de progresso guardadas num bucket privado do
  Supabase Storage, comparação lado a lado sempre por data, e análise
  qualitativa por IA (Claude, via Edge Function) — nunca estima métricas
  numéricas (% de gordura, peso) nem julga aparência; foco em observações
  educativas e encorajadoras, calibradas para iniciantes. Também traz uma
  seção de **Tendências**: gráficos de peso, sono e HRV dos últimos 30 dias,
  puxados de `health_entries` — mesmos dados do módulo Health, só
  visualizados ao longo do tempo em vez de só o registro do dia. O gráfico
  (`src/components/TrendChart.tsx`) é `react-native-svg` direto — a mesma
  lib já usada no `MaverickScoreRing` — sem puxar uma biblioteca de
  gráficos externa só pra isso.
- **Hábitos** (`mission.tsx`) — checklist de hábitos diário com sequência
  (streak) calculada a partir do histórico de conclusões.
- **Nutrition** — registro manual de refeições (café da manhã/almoço/lanche/
  jantar/outro, com calorias e macros opcionais) e água (registrada em
  "doses" — cada toque em "+200ml" vira uma linha, o total do dia é somado
  na hora de exibir). Metas diárias de calorias/macros/água são opcionais —
  sem elas, a tela só mostra o total do dia, sem comparar com uma meta. Mesmo
  espírito do Health: o formato já é o que uma integração futura (leitor de
  rótulo, parceria com food database) vai escrever, só troca quem grava.
- **Treinos** — plano semanal completo por atleta (7 dias, um pode ser
  marcado como descanso), com catálogo de exercícios **compartilhado** entre
  todos os usuários (`exercises` — não é por-usuário, é uma tabela de
  referência tipo "todo mundo pode ler, quem cadastrou pode editar"). Cada
  exercício aceita **foto** (upload, guardada no bucket público
  `exercise-media` — público porque é conteúdo de referência, não dado
  pessoal) e **vídeo de execução** (link colado, ex. YouTube — o app não gera
  nem hospeda vídeo próprio). O atleta registra a execução real (séries,
  reps, carga) por dia, e marca o dia como concluído — isso é sempre
  autorreportado, o treinador nunca marca por ele. Já o **treinador
  vinculado (aceito) tem permissão de escrita no plano** do atleta (montar
  os dias, adicionar/remover exercícios) — é o único módulo do app onde o
  treinador escreve, e não só lê; a tela do Coach (`coach.tsx`) reusa o
  mesmo componente `WorkoutWeek` só que com um atleta alvo diferente do
  usuário logado. Testado ponta a ponta: atleta monta e executa o próprio
  treino, treinador monta o treino de um atleta vinculado e o atleta vê a
  mudança aparecer no próprio app (mesmo plano, não uma cópia).

  **Maverick Coach IA** — pra quem treina sozinho (ou como ponto de partida
  pro treinador ajustar): a IA (Claude, via Edge Function
  `generate-workout-plan`, tool-use forçado pra devolver JSON estruturado)
  monta o plano semanal completo a partir de nível
  (iniciante/intermediário/avançado — calibra volume, complexidade e faixa
  de reps), objetivo e equipamento opcionais, e número de dias de treino por
  semana — distribui os dias de treino ao longo da semana em vez de
  empilhar, e prefere reaproveitar exercícios já cadastrados no catálogo
  (mantém foto/vídeo vinculados). **A IA nunca prescreve carga** — só
  estrutura (dias, exercícios, séries, faixa de reps); a carga real é
  sempre o que o atleta registra ao executar o treino. Testado ao vivo:
  gerado um plano de 4 dias (intermediário, objetivo hipertrofia) com a
  semana bem distribuída (treino-descanso intercalados) e todos os
  exercícios com faixas de reps, sem nenhuma carga sugerida.
- **Coach** — vínculo treinador↔atleta por código, com aprovação manual dos
  dois lados (ninguém aceita o próprio pedido). Qualquer usuário pode ser
  treinador e atleta ao mesmo tempo — não há papéis fixos. Só depois do
  vínculo **aceito** o treinador ganha acesso ao Maverick Score, hábitos,
  nutrição e fotos de progresso do atleta (via policies de RLS extras em
  cada tabela — nunca antes, e sempre **só leitura**). A única exceção é o
  plano de **Treinos**: ali o treinador ganha leitura *e escrita*, porque o
  próprio propósito do acesso é montar o treino da pessoa — a execução em si
  (séries/reps/carga, marcar o dia como feito) continua sempre só do
  atleta. A tela do Coach mostra uma seção de **Nutrição hoje** por atleta
  (calorias, água e a lista de refeições do dia), reusando as mesmas funções
  de leitura de `nutrition.ts` — nenhuma policy de RLS nova foi necessária,
  só a UI. Pedidos de vínculo pendentes (nos dois sentidos — como treinador
  ou como atleta esperando aprovação) também aparecem como um badge numérico
  no ícone do módulo Coach no Painel e em Mais, pra sinalizar sem precisar
  abrir a tela toda vez. É um indicador dentro do app, não uma push
  notification de verdade — isso exigiria `expo-notifications`, registro de
  token por dispositivo e um trigger no banco, o que é um passo bem maior
  (e não dá pra testar no preview web, só num device real).

  **Painel de todos os atletas** — "Seus atletas" deixou de ser só uma lista
  de nomes: cada linha mostra o Maverick Score e um **check-in** — a data da
  atividade mais recente do atleta em qualquer módulo (Health, Treinos,
  Hábitos ou Nutrition; `src/lib/coachOverview.ts`). Não é uma ação própria
  que o atleta precisa fazer — é um proxy honesto de "ainda está usando o
  app", derivado do que ele já registra normalmente. A lista é ordenada com
  quem está **sem check-in há mais de 3 dias primeiro** (bolinha vermelha),
  depois há 2-3 dias (amarela), depois em dia (verde) — o treinador abre a
  tela e já vê quem precisa de atenção, sem entrar atleta por atleta. Um
  resumo no topo da seção soma quantos estão vinculados e quantos estão
  "sem check-in há dias".
- **Admin** — visão só-leitura de **todos** os usuários do app (não só
  vinculados), pra suporte e acompanhamento geral — ver "Segurança" acima
  pra como isso é travado (tabela `app_admins` sem policy de escrita pro
  cliente, `WITH CHECK` nenhum pra escrita em qualquer tabela via admin).
  Só aparece no menu Mais pra quem está em `app_admins`; reusa o mesmo
  `AthleteDetail` do Coach, sem os controles de edição do plano de treino.
- **Planner** — a visão unificada de "treino + nutrição + recuperação" que
  faltava no MVP do documento de visão. Mesma tira de 7 dias dos outros
  módulos; ao escolher um dia, três cards lado a lado: **Treino** (dia,
  exercícios planejados, concluir/desmarcar), **Nutrição** (água e
  calorias do dia, com os mesmos botões de "+água" rápidos) e
  **Recuperação** (sono/HRV/FC/peso daquele dia, mais o Maverick Score
  *como ele era naquele dia* — calculado com o histórico só até ali, não
  com o histórico completo). O Planner é deliberadamente um **resumo**, não
  uma reimplementação: pra editar exercício, macro detalhado ou registrar
  sono, cada card linka pro módulo de verdade — evita duplicar lógica de
  formulário em três lugares. Só a semana atual por enquanto (sem navegar
  pra semanas passadas/futuras).

## Próximos passos sugeridos

Ordem combinada depois da análise de plataforma (documento de visão do
Performance OS comparado com o estado real do app):

1. **Offline nos demais módulos**: Vision, Coach e Hábitos ainda exigem
   conexão pra tudo — Health, Treinos e Nutrition já cobertos (Fase 1 leitura
   + Fase 2 escrita).
2. **Garmin Connect**: aguardando aprovação do Garmin Developer Program —
   assim que sair, entra no mesmo padrão do Strava (Edge Function própria,
   grava em `health_entries`/tabela de atividades).
3. **Apple HealthKit**: requer build nativo (não funciona no preview web).
4. **SMTP próprio** — provedor decidido (Resend), falta criar a conta e
   configurar no painel do Supabase (ver "Autenticação"). Bloqueante antes
   de convidar qualquer pessoa de fora — o rate limit padrão do Supabase já
   travou teste ao vivo aqui mais de uma vez.
5. **Build nativo pra loja** (App Store/Play Store): nenhum passo dado
   ainda — falta `eas.json` (perfis de build), ícone/splash screen em
   `assets/` (hoje sairia com o ícone genérico do Expo), permissões de iOS
   pro seletor de fotos do Vision (`NSPhotoLibraryUsageDescription`/
   `NSCameraUsageDescription` em `app.json` — sem isso a Apple rejeita na
   revisão), conta de desenvolvedor Apple (US$99/ano) e Google (US$25
   único), e Política de Privacidade + Termos de Uso (exigido pelas duas
   lojas, e vale a pena de qualquer forma dado que o app lida com dado de
   saúde). Fase seguinte depois do beta fechado (TestFlight/Play Internal
   Testing).
