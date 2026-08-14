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
7. Para o **Maverick Coach IA** (geração de treino por IA em Treinos), publique
   a Edge Function — reaproveita o mesmo segredo `ANTHROPIC_API_KEY` já
   configurado no passo 5, não precisa configurar de novo:
   ```bash
   npx supabase functions deploy generate-workout-plan --project-ref <seu-ref>
   ```
8. **Nutrition** não precisa de nenhum segredo novo — é só schema (tabelas
   `nutrition_meals`, `nutrition_water_logs`, `nutrition_goals`) já incluído
   no passo 2.

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
  (poucos e-mails por hora) — ótimo pra testar, **não serve pra produção**.
  Antes de usuários reais, configure um provedor de SMTP próprio em
  **Authentication > Settings > SMTP Settings** (Resend, SendGrid, Postmark,
  Amazon SES etc.).

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
    coach.tsx                  # vínculo treinador↔atleta + painel agregado por atleta (fora da tabBar, ver Mais)
    profile.tsx                # fora da tabBar, ver Mais
    planner.tsx                 # semana unificada: treino + nutrição + recuperação por dia (fora da tabBar, ver Mais)
    mais.tsx                   # menu com Planner / Hábitos / Vision / Coach / Perfil / Sair
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
    strava.ts                  # URL de autorização, status, sincronização, formatação
    workouts.ts                # plano semanal, catálogo de exercícios, registro de séries, geração por IA
supabase/
  schema.sql                  # schema completo (tabelas, RLS, bucket de Storage)
  functions/                  # cada uma exporta `handler` (+ helpers puros) e só
                               # sobe Deno.serve se `import.meta.main` — ver "Testes e CI"
    analyze-vision/            # Edge Function que chama a Claude API (visão)
      __tests__/index.test.ts    # Deno test — toBase64, json, ramos do handler sem I/O
    strava-oauth-callback/      # troca o code do Strava por tokens, salva a conexão
      __tests__/index.test.ts    # Deno test — htmlPage, ramos do handler sem I/O
    strava-sync/                 # busca atividades recentes e grava em strava_activities
      __tests__/index.test.ts    # Deno test — toActivityRow, needsTokenRefresh, ramos do handler
    generate-workout-plan/        # Edge Function que chama a Claude API (Maverick Coach IA)
      __tests__/index.test.ts      # Deno test — buildUserMessage, isValidLevel, ramos do handler
.github/
  workflows/ci.yml               # typecheck + testes JS a cada push/PR, + job separado de testes Deno
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

**Treinos** e **Health** funcionam sem internet — são os dois módulos onde
faz mais sentido abrir sem sinal (academia, corrida). Os outros módulos
(Vision, Nutrition, Coach, Hábitos) ainda exigem conexão pra tudo.

**Fase 1 (leitura)** — padrão "cache read-through" em
[`src/lib/offlineCache.ts`](src/lib/offlineCache.ts): `loadWithCache(chave,
fetcher)` tenta buscar do Supabase e, se der certo, salva no `AsyncStorage`
pra próxima vez; se a busca falhar (sem sinal, ou qualquer erro de rede) e
existir algo salvo antes, devolve o cache em vez de quebrar a tela — e
mostra o aviso `<OfflineBanner/>` com o horário do último dado salvo.

**Fase 2 (escrita)** — [`src/lib/offlineSync.ts`](src/lib/offlineSync.ts):
fila persistida no `AsyncStorage`. Quando uma escrita falha por falta de
conexão, em vez de mostrar erro, a intenção fica guardada
(`upsertHealthEntryOffline`, `markDayDoneOffline`, `markDayUndoneOffline`)
e a tela atualiza o próprio estado local na hora (otimista — "salvo no
aparelho, sincroniza sozinho depois"). A fila sai sozinha
(`flushOfflineQueue`) em três momentos: ao abrir o app com sessão ativa
(`OfflineSyncOnStart` em `app/_layout.tsx`), e depois de qualquer
carregamento de Health/Treinos que confirme que a rede voltou. Escritas
repetidas pro mesmo alvo (ex: marcar e desmarcar o mesmo dia offline, ou
registrar o mesmo dia duas vezes) substituem a pendência anterior em vez de
empilhar — só o estado final desejado importa, não o histórico de eventos.
Mesmo escopo da Fase 1: só Health (registrar hoje) e Treinos (marcar/
desmarcar o dia) — fluxos que dependem de resposta da rede pra fazer
sentido (gerar treino por IA, analisar fotos) não são enfileiráveis.

Testado simulando perda de rede de verdade (bloqueando as chamadas
`/rest/v1/` do Supabase no navegador, mantendo `/auth/v1/` liberado pra não
travar o login): com o cache já populado, Treinos e Health continuaram
mostrando os dados certos com o aviso de offline; sem cache pra aquele dado
específico (ex: um dia do plano nunca aberto antes), o app mostra um erro
amigável em vez de travar; registrar um dia novo de Health e marcar um
treino como concluído **offline** atualizaram a tela na hora (com o aviso
de "N alterações aguardando conexão"), e ao restaurar a rede e recarregar,
a fila sumiu sozinha — confirmado direto no banco que os dois chegaram
(`health_entries` e `workout_logs`) com os valores exatos registrados
offline.

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

## Testes e CI

`jest` + `jest-expo` (o preset oficial da Expo, já traz os mocks de módulo
nativo prontos). **Fase 1** — testes de unidade sobre lógica pura em
`src/lib/*.ts`: cálculo do Maverick Score, streak de hábitos, totais de
nutrição, status de check-in do Coach, composição do Daily Brief e o cache
offline. **Fase 2** — testes de componente e de tela com
`@testing-library/react-native` (`^13`, não a `14` — ver nota abaixo):
`Button`, `TextField`, `ModuleCard`, `OfflineBanner` e `TrendChart` como
componentes isolados, e a tela de **Perfil** inteira (`app/(app)/profile.tsx`)
como prova de que dá pra testar uma tela real — render, edição de campo,
salvar, sair — só mockando `useAuth` (nenhuma chamada de rede de verdade).
76 testes, 13 suítes (JS/RN — ver também "Edge Functions (Deno)" abaixo).

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

As 4 Edge Functions (`supabase/functions/*`) têm sua própria suíte, em
Deno — outro runtime, fora do Jest de propósito (`jest.config.js` ignora
`/supabase/functions/` explicitamente pra nunca confundir os dois). 32
testes, mesma filosofia da Fase 1 do Jest: lógica pura extraída do handler
primeiro — `toActivityRow`/`needsTokenRefresh` (strava-sync),
`buildUserMessage`/`isValidLevel` (generate-workout-plan), `htmlPage`
(strava-oauth-callback), `toBase64` (analyze-vision) — mais os ramos do
handler que retornam **antes** de precisar de Supabase/Claude/Strava de
verdade (CORS, autenticação, validação de entrada). O que exige uma API
externa de verdade (trocar código OAuth por token, chamar a Claude) fica
de fora — não dá pra testar isso sem gastar chamada real.

```bash
# instala o Deno (uma vez): irm https://deno.land/install.ps1 | iex  (PowerShell/Windows)
deno test --allow-net --allow-env --node-modules-dir=none \
  supabase/functions/strava-oauth-callback \
  supabase/functions/strava-sync \
  supabase/functions/generate-workout-plan \
  supabase/functions/analyze-vision
```

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
  sincroniza corridas/pedais/natação/etc. Os tokens do Strava nunca ficam
  legíveis pelo app nem pelo dono da conta — só as Edge Functions, via
  `service_role`, os tocam. Integração com Garmin (aguardando aprovação do
  Developer Program) e Apple HealthKit (precisa de build nativo) seguem
  como próximos passos, escrevendo na mesma `health_entries`.
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

1. **Offline nos demais módulos**: Vision, Nutrition, Coach e Hábitos ainda
   exigem conexão pra tudo — extensão natural do mesmo `loadWithCache` (Fase
   1) / `offlineSync.ts` (Fase 2, pra Nutrition — registrar refeição/água
   offline seria o próximo candidato natural, mesmo padrão de Health).
2. **Garmin Connect**: aguardando aprovação do Garmin Developer Program —
   assim que sair, entra no mesmo padrão do Strava (Edge Function própria,
   grava em `health_entries`/tabela de atividades).
3. **Apple HealthKit**: requer build nativo (não funciona no preview web).
4. **Sincronização automática do Strava** (hoje é sob demanda, via botão
   "Sincronizar" — dá pra rodar num cron/webhook do Strava depois).
5. **SMTP próprio** antes de produção real (ver aviso em "Autenticação").
6. **Mais telas cobertas por teste**: só Perfil tem teste de tela completo
   até agora (ver "Testes e CI") — as próximas telas a valer a pena testar
   são as com mais lógica de interação (Hábitos, Nutrition).
