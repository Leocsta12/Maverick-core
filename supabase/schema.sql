-- Maverick Core — schema de autenticação (Fase 2: Supabase)
--
-- Como aplicar: painel do projeto Supabase > SQL Editor > cole este
-- arquivo inteiro > Run. Idempotente (pode rodar de novo sem duplicar).

-- 1) Tabela de perfis, 1:1 com auth.users.
-- auth.users já guarda email/senha; guardamos aqui o que é específico
-- do app (nome, e futuramente dados dos módulos Vision/Health/Mission).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  coach_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Coluna adicionada na Fase 6 (Coach) — usuários já existentes ganham a
-- coluna aqui e o código é preenchido no bloco de backfill mais abaixo.
alter table public.profiles add column if not exists coach_code text;

create unique index if not exists profiles_coach_code_idx
  on public.profiles (coach_code)
  where coach_code is not null;

alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

-- 2) Ao criar um usuário (signUp), cria automaticamente a linha de
-- perfil correspondente, puxando o "name" que foi passado em
-- options.data no signUp do lado do app, e gera um código curto e único
-- pra esse usuário poder ser encontrado como treinador (módulo Coach).
create or replace function public.generate_coach_code()
returns text
language plpgsql
as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.profiles where coach_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, coach_code)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), public.generate_coach_code());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3) Mantém updated_at em dia nas edições de perfil.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Maverick Core — schema do módulo Health (Fase 3)
--
-- Fase 1 do módulo: registro manual de sono, HRV, FC de repouso e passos.
-- Guardado 1 linha por usuário por dia (upsert) — é o mesmo formato que
-- viria de uma sincronização automática futura (Garmin/Apple Health/Strava),
-- então quando essa integração existir ela escreve nesta mesma tabela sem
-- precisar mudar o resto do app.
create table if not exists public.health_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null default current_date,
  sleep_hours numeric(4, 1),
  hrv_ms integer,
  resting_hr integer,
  steps integer,
  created_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

-- Peso e % de gordura, pro módulo Evolution (gráficos de tendência em
-- Vision) — mesma tabela de sempre, mesmo espírito de "formato pronto pra
-- integração automática futura".
alter table public.health_entries add column if not exists weight_kg numeric(5, 1);
alter table public.health_entries add column if not exists body_fat_pct numeric(4, 1);

alter table public.health_entries enable row level security;

drop policy if exists "health_entries: select own" on public.health_entries;
create policy "health_entries: select own"
  on public.health_entries for select
  using (auth.uid() = user_id);

drop policy if exists "health_entries: insert own" on public.health_entries;
create policy "health_entries: insert own"
  on public.health_entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "health_entries: update own" on public.health_entries;
create policy "health_entries: update own"
  on public.health_entries for update
  using (auth.uid() = user_id);

drop policy if exists "health_entries: delete own" on public.health_entries;
create policy "health_entries: delete own"
  on public.health_entries for delete
  using (auth.uid() = user_id);

create index if not exists health_entries_user_date_idx
  on public.health_entries (user_id, entry_date desc);

-- Maverick Core — schema do módulo Vision (Fase 4)
--
-- Fotos de composição corporal, comparação lado a lado por data, e análise
-- qualitativa por IA (via Edge Function analyze-vision, que chama a Claude API
-- com um prompt calibrado pra nunca estimar métricas numéricas nem julgar
-- aparência — só descrever mudanças visíveis de forma encorajadora).

create table if not exists public.vision_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'image/jpeg',
  taken_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.vision_photos enable row level security;

drop policy if exists "vision_photos: select own" on public.vision_photos;
create policy "vision_photos: select own"
  on public.vision_photos for select
  using (auth.uid() = user_id);

drop policy if exists "vision_photos: insert own" on public.vision_photos;
create policy "vision_photos: insert own"
  on public.vision_photos for insert
  with check (auth.uid() = user_id);

drop policy if exists "vision_photos: delete own" on public.vision_photos;
create policy "vision_photos: delete own"
  on public.vision_photos for delete
  using (auth.uid() = user_id);

create index if not exists vision_photos_user_date_idx
  on public.vision_photos (user_id, taken_date desc);

-- Histórico das análises geradas (evita reprocessar a mesma comparação e dá
-- um registro do que a IA já disse pro usuário).
create table if not exists public.vision_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  photo_a_id uuid not null references public.vision_photos (id) on delete cascade,
  photo_b_id uuid not null references public.vision_photos (id) on delete cascade,
  analysis_text text not null,
  created_at timestamptz not null default now()
);

alter table public.vision_analyses enable row level security;

drop policy if exists "vision_analyses: select own" on public.vision_analyses;
create policy "vision_analyses: select own"
  on public.vision_analyses for select
  using (auth.uid() = user_id);

drop policy if exists "vision_analyses: insert own" on public.vision_analyses;
create policy "vision_analyses: insert own"
  on public.vision_analyses for insert
  with check (auth.uid() = user_id);

-- Bucket privado de Storage pra fotos. Caminho esperado: "<user_id>/<arquivo>"
-- — as policies abaixo usam o primeiro segmento do caminho pra checar dono.
insert into storage.buckets (id, name, public)
values ('vision-photos', 'vision-photos', false)
on conflict (id) do nothing;

drop policy if exists "vision-photos: select own" on storage.objects;
create policy "vision-photos: select own"
  on storage.objects for select
  using (bucket_id = 'vision-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "vision-photos: insert own" on storage.objects;
create policy "vision-photos: insert own"
  on storage.objects for insert
  with check (bucket_id = 'vision-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "vision-photos: delete own" on storage.objects;
create policy "vision-photos: delete own"
  on storage.objects for delete
  using (bucket_id = 'vision-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Maverick Core — schema do módulo Mission (Fase 5)
--
-- Checklist de hábitos: cada hábito é registrado como "feito" em datas
-- específicas (1 registro por hábito por dia, upsert-friendly), o que dá
-- tanto o check diário quanto a sequência (streak) sem precisar de coluna
-- separada — a streak é calculada no cliente a partir das datas registradas.

create table if not exists public.mission_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.mission_habits enable row level security;

drop policy if exists "mission_habits: select own" on public.mission_habits;
create policy "mission_habits: select own"
  on public.mission_habits for select
  using (auth.uid() = user_id);

drop policy if exists "mission_habits: insert own" on public.mission_habits;
create policy "mission_habits: insert own"
  on public.mission_habits for insert
  with check (auth.uid() = user_id);

drop policy if exists "mission_habits: update own" on public.mission_habits;
create policy "mission_habits: update own"
  on public.mission_habits for update
  using (auth.uid() = user_id);

drop policy if exists "mission_habits: delete own" on public.mission_habits;
create policy "mission_habits: delete own"
  on public.mission_habits for delete
  using (auth.uid() = user_id);

create table if not exists public.mission_completions (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.mission_habits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  completed_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (habit_id, completed_date)
);

alter table public.mission_completions enable row level security;

drop policy if exists "mission_completions: select own" on public.mission_completions;
create policy "mission_completions: select own"
  on public.mission_completions for select
  using (auth.uid() = user_id);

drop policy if exists "mission_completions: insert own" on public.mission_completions;
create policy "mission_completions: insert own"
  on public.mission_completions for insert
  with check (auth.uid() = user_id);

-- Necessária porque upsert() faz UPDATE quando a linha já existe (ex: marcar
-- o mesmo dia de novo) — sem isso o RLS bloqueia com "violates row-level
-- security policy" mesmo sendo o dono da linha.
drop policy if exists "mission_completions: update own" on public.mission_completions;
create policy "mission_completions: update own"
  on public.mission_completions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "mission_completions: delete own" on public.mission_completions;
create policy "mission_completions: delete own"
  on public.mission_completions for delete
  using (auth.uid() = user_id);

create index if not exists mission_completions_habit_date_idx
  on public.mission_completions (habit_id, completed_date desc);

-- Backfill: usuários criados antes da coluna coach_code existir precisam
-- de um código também. Só afeta quem ainda está com coach_code nulo —
-- seguro rodar de novo.
do $$
declare
  r record;
begin
  for r in select id from public.profiles where coach_code is null loop
    update public.profiles set coach_code = public.generate_coach_code() where id = r.id;
  end loop;
end $$;

-- Maverick Core — schema do módulo Coach (Fase 6)
--
-- Vínculo treinador↔atleta com aprovação manual. Quem inicia o pedido (o
-- atleta digitando o código do treinador, ou vice-versa) fica com
-- requested_by; a OUTRA parte precisa responder (aceitar/recusar) — ninguém
-- aprova o próprio pedido. Só depois de "accepted" o treinador ganha acesso
-- de leitura aos dados do atleta (policies extras abaixo, em cada tabela).
-- Vision (fotos) está incluído de propósito, a pedido do produto — é dado
-- sensível, então só é liberado com vínculo aceito, nunca antes.
create table if not exists public.coach_links (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users (id) on delete cascade,
  athlete_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  requested_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (coach_id, athlete_id),
  check (coach_id <> athlete_id)
);

alter table public.coach_links enable row level security;

drop policy if exists "coach_links: select as participant" on public.coach_links;
create policy "coach_links: select as participant"
  on public.coach_links for select
  using (auth.uid() = coach_id or auth.uid() = athlete_id);

-- Só a CONTRAPARTE (quem não pediu) pode responder, e só enquanto pendente.
-- Não existe policy de insert direta de propósito — todo pedido passa pela
-- função request_coach_link() abaixo, que valida o código antes de criar.
drop policy if exists "coach_links: respond as counterparty" on public.coach_links;
create policy "coach_links: respond as counterparty"
  on public.coach_links for update
  using (
    (auth.uid() = coach_id or auth.uid() = athlete_id)
    and requested_by <> auth.uid()
    and status = 'pending'
  )
  with check (status in ('accepted', 'rejected'));

drop policy if exists "coach_links: delete as participant" on public.coach_links;
create policy "coach_links: delete as participant"
  on public.coach_links for delete
  using (auth.uid() = coach_id or auth.uid() = athlete_id);

create index if not exists coach_links_coach_idx on public.coach_links (coach_id, status);
create index if not exists coach_links_athlete_idx on public.coach_links (athlete_id, status);

-- Resolve um código de treinador pro id correspondente e cria (ou reabre) o
-- pedido de vínculo. security definer porque o cliente não tem — e não deve
-- ter — permissão de SELECT na tabela profiles de outra pessoa só pra achar
-- o dono do código.
create or replace function public.request_coach_link(p_code text)
returns public.coach_links
language plpgsql
security definer set search_path = public
as $$
declare
  v_coach_id uuid;
  v_link public.coach_links;
begin
  select id into v_coach_id from public.profiles where coach_code = upper(trim(p_code));
  if v_coach_id is null then
    raise exception 'CODIGO_INVALIDO' using errcode = 'P0001';
  end if;
  if v_coach_id = auth.uid() then
    raise exception 'NAO_PODE_VINCULAR_A_SI_MESMO' using errcode = 'P0001';
  end if;

  insert into public.coach_links (coach_id, athlete_id, status, requested_by)
  values (v_coach_id, auth.uid(), 'pending', auth.uid())
  on conflict (coach_id, athlete_id) do update
    set status = 'pending', requested_by = auth.uid(), responded_at = null
    where public.coach_links.status <> 'accepted'
  returning * into v_link;

  if v_link.id is null then
    raise exception 'JA_VINCULADO' using errcode = 'P0001';
  end if;

  return v_link;
end;
$$;

grant execute on function public.request_coach_link(text) to authenticated;

-- A partir daqui: uma policy extra de SELECT por tabela, liberando leitura
-- pro treinador quando existe vínculo "accepted". São policies PERMISSIVAS
-- adicionais — somam com as de "select own" já existentes, nunca substituem.

drop policy if exists "profiles: select as counterparty" on public.profiles;
create policy "profiles: select as counterparty"
  on public.profiles for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.status in ('pending', 'accepted')
        and (
          (cl.coach_id = auth.uid() and cl.athlete_id = profiles.id)
          or (cl.athlete_id = auth.uid() and cl.coach_id = profiles.id)
        )
    )
  );

drop policy if exists "health_entries: select as coach" on public.health_entries;
create policy "health_entries: select as coach"
  on public.health_entries for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = health_entries.user_id and cl.status = 'accepted'
    )
  );

drop policy if exists "mission_habits: select as coach" on public.mission_habits;
create policy "mission_habits: select as coach"
  on public.mission_habits for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = mission_habits.user_id and cl.status = 'accepted'
    )
  );

drop policy if exists "mission_completions: select as coach" on public.mission_completions;
create policy "mission_completions: select as coach"
  on public.mission_completions for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = mission_completions.user_id and cl.status = 'accepted'
    )
  );

drop policy if exists "vision_photos: select as coach" on public.vision_photos;
create policy "vision_photos: select as coach"
  on public.vision_photos for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = vision_photos.user_id and cl.status = 'accepted'
    )
  );

drop policy if exists "vision_analyses: select as coach" on public.vision_analyses;
create policy "vision_analyses: select as coach"
  on public.vision_analyses for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = vision_analyses.user_id and cl.status = 'accepted'
    )
  );

-- Storage: mesma lógica, pro treinador conseguir baixar os arquivos das
-- fotos do atleta (não só a metadata da tabela vision_photos).
drop policy if exists "vision-photos: select as coach" on storage.objects;
create policy "vision-photos: select as coach"
  on storage.objects for select
  using (
    bucket_id = 'vision-photos'
    and exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid()
        and cl.status = 'accepted'
        and cl.athlete_id::text = (storage.foldername(name))[1]
    )
  );

-- Maverick Core — schema do módulo Strava (Fase 7)
--
-- strava_connections guarda os tokens OAuth — de propósito SEM nenhuma
-- policy de select/insert/update pro papel "authenticated". Ninguém lê um
-- access_token ou refresh_token pelo cliente, nem o dono da conta: só as
-- Edge Functions (strava-oauth-callback, strava-sync), que usam a
-- service_role key e por isso ignoram RLS. O app descobre se está
-- conectado só através da função get_my_strava_status() abaixo, que nunca
-- devolve os tokens.
create table if not exists public.strava_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  strava_athlete_id bigint not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now()
);

alter table public.strava_connections enable row level security;

-- Exceção deliberada: só a policy de DELETE existe pro dono, pra ele poder
-- desconectar direto do app sem precisar de outra Edge Function — apagar a
-- linha não expõe nenhum token.
drop policy if exists "strava_connections: delete own" on public.strava_connections;
create policy "strava_connections: delete own"
  on public.strava_connections for delete
  using (auth.uid() = user_id);

create or replace function public.get_my_strava_status()
returns table (connected boolean, strava_athlete_id bigint, connected_at timestamptz)
language sql
security definer set search_path = public
stable
as $$
  select true, sc.strava_athlete_id, sc.connected_at
  from public.strava_connections sc
  where sc.user_id = auth.uid()
$$;

grant execute on function public.get_my_strava_status() to authenticated;

-- Atividades sincronizadas do Strava — dado normal do usuário (não é
-- credencial), então segue o mesmo padrão de RLS dos outros módulos:
-- dono lê e escreve, treinador vinculado (accepted) só lê.
create table if not exists public.strava_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  strava_activity_id bigint not null unique,
  activity_type text not null,
  name text not null default '',
  distance_m numeric,
  moving_time_s integer,
  calories numeric,
  average_heartrate numeric,
  started_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Métricas de endurance específicas por esporte (Fase "Coach de endurance") —
-- o Strava já devolve isso tudo no endpoint de listagem de atividades
-- (sem precisar de chamada extra por atividade nem estourar rate limit),
-- só que o toActivityRow original não capturava. sport_type é o campo
-- mais granular do Strava (Run/TrailRun/VirtualRide/Swim etc.) — mantido
-- junto de activity_type (mais antigo, usado como fallback) pra não
-- quebrar nada que já lê essa coluna.
alter table public.strava_activities add column if not exists sport_type text;
alter table public.strava_activities add column if not exists average_speed_ms numeric;
alter table public.strava_activities add column if not exists max_speed_ms numeric;
alter table public.strava_activities add column if not exists average_watts numeric;
alter table public.strava_activities add column if not exists weighted_average_watts numeric;
alter table public.strava_activities add column if not exists average_cadence numeric;
alter table public.strava_activities add column if not exists total_elevation_gain_m numeric;
alter table public.strava_activities add column if not exists max_heartrate numeric;

alter table public.strava_activities enable row level security;

drop policy if exists "strava_activities: select own" on public.strava_activities;
create policy "strava_activities: select own"
  on public.strava_activities for select
  using (auth.uid() = user_id);

drop policy if exists "strava_activities: select as coach" on public.strava_activities;
create policy "strava_activities: select as coach"
  on public.strava_activities for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = strava_activities.user_id and cl.status = 'accepted'
    )
  );

-- Sem policy de insert/update/delete pro cliente — só a Edge Function
-- strava-sync escreve aqui (via service_role, no upsert por strava_activity_id).

create index if not exists strava_activities_user_date_idx
  on public.strava_activities (user_id, started_at desc);

-- Maverick Core — schema do módulo Treinos (Fase 8)
--
-- Catálogo de exercícios (compartilhado entre todos os usuários, como uma
-- wikipédia de exercícios) + plano semanal por atleta (7 dias, cada um com
-- uma lista de exercícios) + registro do que foi de fato executado
-- (séries/repetições/carga). O treinador vinculado (accepted) pode LER e
-- ESCREVER o plano do atleta — é diferente de Health/Vision/Mission, onde
-- ele só lê. O registro de execução em si (workout_logs/_sets) é sempre
-- escrito pelo próprio atleta — o treinador só lê, nunca registra por ele.

-- 1) Catálogo de exercícios — compartilhado. Qualquer usuário autenticado
-- pode ver todos e cadastrar novos; só quem criou pode editar/apagar.
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text,
  description text,
  photo_path text,
  video_url text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.exercises enable row level security;

drop policy if exists "exercises: select all" on public.exercises;
create policy "exercises: select all"
  on public.exercises for select
  using (true);

drop policy if exists "exercises: insert own" on public.exercises;
create policy "exercises: insert own"
  on public.exercises for insert
  with check (auth.uid() = created_by);

-- "own OR sem dono" — exercícios seedados (created_by null) ficam abertos
-- pra qualquer usuário autenticado melhorar (anexar foto/vídeo, ajustar
-- descrição), tipo wiki. Um exercício CRIADO por alguém específico
-- continua travado só pra essa pessoa — a regra original nunca foi
-- pensada pra bloquear edição do catálogo compartilhado, só pra evitar
-- que um estranho mexa no exercício custom de outro usuário.
drop policy if exists "exercises: update own" on public.exercises;
drop policy if exists "exercises: update own or unclaimed" on public.exercises;
create policy "exercises: update own or unclaimed"
  on public.exercises for update
  using (auth.uid() = created_by or created_by is null);

drop policy if exists "exercises: delete own" on public.exercises;
create policy "exercises: delete own"
  on public.exercises for delete
  using (auth.uid() = created_by);

-- Bucket público de mídia dos exercícios — não é dado pessoal (é conteúdo
-- de referência compartilhado), então fica de leitura pública, sem
-- precisar de signed URL. Upload só por usuário autenticado.
insert into storage.buckets (id, name, public)
values ('exercise-media', 'exercise-media', true)
on conflict (id) do nothing;

drop policy if exists "exercise-media: select public" on storage.objects;
create policy "exercise-media: select public"
  on storage.objects for select
  using (bucket_id = 'exercise-media');

drop policy if exists "exercise-media: insert authenticated" on storage.objects;
create policy "exercise-media: insert authenticated"
  on storage.objects for insert
  with check (bucket_id = 'exercise-media' and auth.role() = 'authenticated');

-- 2) Plano semanal por atleta. created_by pode ser o próprio atleta ou um
-- treinador vinculado — mas o "dono" dos dados é sempre user_id.
create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Meu treino',
  created_by uuid not null references auth.users (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nível do atleta e objetivo, usados pra IA montar o treino (Maverick
-- Coach IA) e reaproveitados se a pessoa pedir pra gerar de novo depois.
alter table public.workout_plans add column if not exists level text
  check (level in ('iniciante', 'intermediario', 'avancado'));
alter table public.workout_plans add column if not exists goal text;

-- Migração: um bug de corrida (efeito duplo do React em dev, montagens
-- concorrentes) permitia criar mais de um plano "ativo" pro mesmo atleta
-- antes dessa constraint existir. Mantém o mais antigo, apaga os outros
-- (os dias de cada plano duplicado somem em cascata — sem problema, já
-- que só o mais antigo tinha exercícios reais adicionados por um usuário).
delete from public.workout_plans wp
using (
  select id, row_number() over (partition by user_id order by created_at asc, id asc) as rn
  from public.workout_plans
) ranked
where wp.id = ranked.id and ranked.rn > 1;

create unique index if not exists workout_plans_user_id_key on public.workout_plans (user_id);

alter table public.workout_plans enable row level security;

drop policy if exists "workout_plans: select own or as coach" on public.workout_plans;
create policy "workout_plans: select own or as coach"
  on public.workout_plans for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = workout_plans.user_id and cl.status = 'accepted'
    )
  );

-- Treinador tem escrita aqui (diferente dos outros módulos) — é o
-- propósito do recurso: montar o treino do atleta.
drop policy if exists "workout_plans: write own or as coach" on public.workout_plans;
create policy "workout_plans: write own or as coach"
  on public.workout_plans for all
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = workout_plans.user_id and cl.status = 'accepted'
    )
  )
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = workout_plans.user_id and cl.status = 'accepted'
    )
  );

create table if not exists public.workout_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = domingo … 6 = sábado
  label text not null default '',
  is_rest_day boolean not null default false,
  sort_order integer not null default 0,
  unique (plan_id, day_of_week)
);

alter table public.workout_plan_days enable row level security;

drop policy if exists "workout_plan_days: select via plan" on public.workout_plan_days;
create policy "workout_plan_days: select via plan"
  on public.workout_plan_days for select
  using (
    exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_days.plan_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.coach_links cl
            where cl.coach_id = auth.uid() and cl.athlete_id = p.user_id and cl.status = 'accepted'
          )
        )
    )
  );

drop policy if exists "workout_plan_days: write via plan" on public.workout_plan_days;
create policy "workout_plan_days: write via plan"
  on public.workout_plan_days for all
  using (
    exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_days.plan_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.coach_links cl
            where cl.coach_id = auth.uid() and cl.athlete_id = p.user_id and cl.status = 'accepted'
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_days.plan_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.coach_links cl
            where cl.coach_id = auth.uid() and cl.athlete_id = p.user_id and cl.status = 'accepted'
          )
        )
    )
  );

create table if not exists public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.workout_plan_days (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  sets integer,
  reps text,
  notes text,
  sort_order integer not null default 0
);

alter table public.workout_plan_exercises enable row level security;

drop policy if exists "workout_plan_exercises: select via plan" on public.workout_plan_exercises;
create policy "workout_plan_exercises: select via plan"
  on public.workout_plan_exercises for select
  using (
    exists (
      select 1 from public.workout_plan_days d
      join public.workout_plans p on p.id = d.plan_id
      where d.id = workout_plan_exercises.plan_day_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.coach_links cl
            where cl.coach_id = auth.uid() and cl.athlete_id = p.user_id and cl.status = 'accepted'
          )
        )
    )
  );

drop policy if exists "workout_plan_exercises: write via plan" on public.workout_plan_exercises;
create policy "workout_plan_exercises: write via plan"
  on public.workout_plan_exercises for all
  using (
    exists (
      select 1 from public.workout_plan_days d
      join public.workout_plans p on p.id = d.plan_id
      where d.id = workout_plan_exercises.plan_day_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.coach_links cl
            where cl.coach_id = auth.uid() and cl.athlete_id = p.user_id and cl.status = 'accepted'
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.workout_plan_days d
      join public.workout_plans p on p.id = d.plan_id
      where d.id = workout_plan_exercises.plan_day_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.coach_links cl
            where cl.coach_id = auth.uid() and cl.athlete_id = p.user_id and cl.status = 'accepted'
          )
        )
    )
  );

-- 3) Registro de execução — sempre escrito pelo próprio atleta. O
-- treinador só lê (ele não deveria "marcar" um treino que não fez).
create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_day_id uuid references public.workout_plan_days (id) on delete set null,
  log_date date not null default current_date,
  completed boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, log_date, plan_day_id)
);

alter table public.workout_logs enable row level security;

drop policy if exists "workout_logs: select own or as coach" on public.workout_logs;
create policy "workout_logs: select own or as coach"
  on public.workout_logs for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = workout_logs.user_id and cl.status = 'accepted'
    )
  );

drop policy if exists "workout_logs: insert own" on public.workout_logs;
create policy "workout_logs: insert own"
  on public.workout_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "workout_logs: update own" on public.workout_logs;
create policy "workout_logs: update own"
  on public.workout_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workout_logs: delete own" on public.workout_logs;
create policy "workout_logs: delete own"
  on public.workout_logs for delete
  using (auth.uid() = user_id);

create table if not exists public.workout_log_sets (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.workout_logs (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  set_number integer not null,
  reps_done integer,
  weight_kg numeric,
  created_at timestamptz not null default now()
);

-- RPE (Rate of Perceived Exertion, escala Borg CR10: 1 = muito leve, 10 =
-- falha total) por série — é o que destrava sugestão de progressão de
-- carga (ver src/lib/progressiveOverload.ts) sem precisar de mais nada do
-- atleta além do que ele já registra. Numeric (não integer) porque a
-- prática comum usa meios pontos (ex.: RPE 8.5).
alter table public.workout_log_sets add column if not exists rpe numeric;

alter table public.workout_log_sets enable row level security;

drop policy if exists "workout_log_sets: select via log" on public.workout_log_sets;
create policy "workout_log_sets: select via log"
  on public.workout_log_sets for select
  using (
    exists (
      select 1 from public.workout_logs l
      where l.id = workout_log_sets.log_id
        and (
          l.user_id = auth.uid()
          or exists (
            select 1 from public.coach_links cl
            where cl.coach_id = auth.uid() and cl.athlete_id = l.user_id and cl.status = 'accepted'
          )
        )
    )
  );

drop policy if exists "workout_log_sets: write own via log" on public.workout_log_sets;
create policy "workout_log_sets: write own via log"
  on public.workout_log_sets for all
  using (
    exists (select 1 from public.workout_logs l where l.id = workout_log_sets.log_id and l.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.workout_logs l where l.id = workout_log_sets.log_id and l.user_id = auth.uid())
  );

create index if not exists workout_plan_days_plan_idx on public.workout_plan_days (plan_id, day_of_week);
create index if not exists workout_plan_exercises_day_idx on public.workout_plan_exercises (plan_day_id, sort_order);
create index if not exists workout_logs_user_date_idx on public.workout_logs (user_id, log_date desc);
create index if not exists workout_log_sets_log_idx on public.workout_log_sets (log_id);

-- Seed: exercícios comuns pra não começar (nem continuar) com o catálogo
-- curto — ampliado depois que ficou claro, usando de verdade, que 9
-- opções é pouco pra montar um treino variado. Sem foto/vídeo — quem
-- cadastrar/editar depois anexa a mídia de verdade. `where not exists`
-- torna o bloco idempotente — pode rodar de novo (ou ampliar de novo no
-- futuro) sem duplicar o que já existe.
insert into public.exercises (name, muscle_group, description, created_by)
select v.name, v.muscle_group, v.description, null
from (values
  -- Peito
  ('Supino reto', 'Peito', 'Supino com barra, banco reto.'),
  ('Supino inclinado', 'Peito', 'Supino com barra ou halteres, banco a 30-45°, foca a parte superior do peitoral.'),
  ('Supino declinado', 'Peito', 'Supino com barra ou halteres, banco declinado, foca a parte inferior do peitoral.'),
  ('Crucifixo com halteres', 'Peito', 'Abertura de braços com halteres, banco reto ou inclinado.'),
  ('Crossover no cabo', 'Peito', 'Adução de braços na polia alta, cruzando as mãos à frente do corpo.'),
  ('Flexão de braço', 'Peito', 'Flexão de braço no chão, mãos na largura dos ombros — sem equipamento.'),
  ('Peck deck (voador)', 'Peito', 'Adução de braços na máquina, cotovelos apoiados.'),
  -- Costas
  ('Levantamento terra', 'Costas', 'Puxada do chão com barra, postura neutra de coluna.'),
  ('Puxada frontal', 'Costas', 'Puxada na polia alta, pegada pronada.'),
  ('Remada curvada', 'Costas', 'Remada com barra, tronco inclinado à frente.'),
  ('Remada unilateral com halter', 'Costas', 'Remada com um halter por vez, apoio de joelho e mão no banco.'),
  ('Remada baixa (cabo sentado)', 'Costas', 'Remada na polia baixa, sentado, puxando até o abdômen.'),
  ('Barra fixa (pull-up)', 'Costas', 'Puxada do corpo até o queixo passar a barra, pegada pronada ou supinada.'),
  ('Hiperextensão lombar', 'Costas', 'Extensão de tronco no banco romano, foca lombar e posterior de coxa.'),
  -- Pernas
  ('Agachamento livre', 'Pernas', 'Agachamento com barra livre, pés na largura dos ombros.'),
  ('Leg press', 'Pernas', 'Empurrar a plataforma com as pernas, sentado na máquina inclinada.'),
  ('Cadeira extensora', 'Pernas', 'Extensão de joelho na máquina, foca quadríceps.'),
  ('Mesa flexora', 'Pernas', 'Flexão de joelho na máquina, deitado, foca posterior de coxa.'),
  ('Afundo (lunge)', 'Pernas', 'Passada à frente flexionando os dois joelhos, com ou sem halteres.'),
  ('Agachamento búlgaro', 'Pernas', 'Agachamento unilateral com o pé de trás apoiado num banco.'),
  ('Stiff', 'Pernas', 'Levantamento terra com pernas quase estendidas, foca posterior de coxa e glúteo.'),
  -- Glúteos
  ('Elevação pélvica (hip thrust)', 'Glúteos', 'Elevação do quadril com apoio das costas no banco, barra sobre o quadril.'),
  ('Coice no cabo (glute kickback)', 'Glúteos', 'Extensão de quadril na polia baixa, tornozelo preso ao cabo.'),
  ('Abdução de quadril', 'Glúteos', 'Afastamento lateral da perna na máquina ou com elástico, foca glúteo médio.'),
  -- Ombro
  ('Desenvolvimento com halteres', 'Ombro', 'Elevação dos halteres acima da cabeça, sentado ou em pé.'),
  ('Elevação lateral', 'Ombro', 'Elevação dos halteres até a lateral, cotovelos levemente flexionados.'),
  ('Elevação frontal', 'Ombro', 'Elevação dos halteres ou barra até a altura dos ombros, à frente do corpo.'),
  ('Remada alta', 'Ombro', 'Puxada da barra até a altura do peito, cotovelos guiando o movimento.'),
  ('Face pull', 'Ombro', 'Puxada da corda na polia alta em direção ao rosto, foca deltoide posterior.'),
  ('Encolhimento de trapézio (shrug)', 'Ombro', 'Elevação dos ombros com barra ou halteres, sem flexionar o cotovelo.'),
  -- Braço
  ('Rosca direta', 'Braço', 'Flexão de cotovelo com barra ou halteres.'),
  ('Rosca alternada', 'Braço', 'Flexão de cotovelo com halteres, alternando os braços.'),
  ('Rosca martelo', 'Braço', 'Flexão de cotovelo com halteres, pegada neutra (palmas viradas uma pra outra).'),
  ('Rosca scott', 'Braço', 'Flexão de cotovelo apoiado no banco scott, isola o bíceps.'),
  ('Tríceps corda', 'Braço', 'Extensão de cotovelo na polia alta com corda.'),
  ('Tríceps testa', 'Braço', 'Extensão de cotovelo deitado, barra ou halteres descendo em direção à testa.'),
  ('Tríceps francês', 'Braço', 'Extensão de cotovelo acima da cabeça, com halter ou barra.'),
  ('Mergulho no banco (bench dip)', 'Braço', 'Flexão de cotovelo apoiado de costas num banco, pernas estendidas à frente.'),
  -- Core
  ('Prancha abdominal', 'Core', 'Sustentação isométrica em apoio nos antebraços.'),
  ('Prancha lateral', 'Core', 'Sustentação isométrica de lado, apoio num antebraço, foca oblíquos.'),
  ('Abdominal supra', 'Core', 'Flexão de tronco deitado, foca porção superior do abdômen.'),
  ('Elevação de pernas', 'Core', 'Elevação das pernas estendidas, deitado ou suspenso na barra, foca abdômen inferior.'),
  ('Russian twist', 'Core', 'Rotação de tronco sentado, com ou sem peso, pés apoiados ou suspensos.'),
  -- Panturrilha
  ('Elevação de panturrilha em pé', 'Panturrilha', 'Extensão de tornozelo em pé, com ou sem carga.'),
  ('Elevação de panturrilha sentado', 'Panturrilha', 'Extensão de tornozelo sentado, foca a porção mais profunda da panturrilha.'),
  -- Cardio / Funcional
  ('Corrida leve', 'Cardio', 'Corrida em ritmo confortável, conversável.'),
  ('Corrida intervalada', 'Cardio', 'Alternância entre tiros de alta intensidade e recuperação.'),
  ('Bicicleta ergométrica', 'Cardio', 'Pedalada estacionária, intensidade e ritmo ajustáveis.'),
  ('Pular corda', 'Cardio', 'Saltos contínuos com corda, aquece e trabalha condicionamento.'),
  ('Remo ergômetro', 'Cardio', 'Remada estacionária, trabalha corpo inteiro em cadência.'),
  ('Burpee', 'Funcional', 'Agachamento + prancha + flexão + salto, num movimento só.'),
  ('Kettlebell swing', 'Funcional', 'Balanço do kettlebell entre as pernas até a altura dos ombros, impulso do quadril.'),
  ('Mountain climber', 'Funcional', 'Corrida estacionária em posição de prancha, joelhos alternando em direção ao peito.')
) as v(name, muscle_group, description)
where not exists (select 1 from public.exercises e where e.name = v.name);

-- ============================================================
-- Maverick Nutrition — Fase 1: registro manual de refeições e água.
-- Mesmo espírito do Health: o formato já é o que uma integração futura
-- (import de foto de rótulo, parceria com food database) vai escrever —
-- só troca quem grava, tela e cálculo continuam os mesmos.
-- ============================================================

-- Metas diárias opcionais do atleta (calorias/macros/água). Uma linha por
-- usuário — se não configurar, o app assume só a meta padrão de água.
create table if not exists public.nutrition_goals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily_calories integer,
  daily_protein_g integer,
  daily_carbs_g integer,
  daily_fat_g integer,
  daily_water_ml integer not null default 2000,
  updated_at timestamptz not null default now()
);

alter table public.nutrition_goals enable row level security;

drop policy if exists "nutrition_goals: select own or as coach" on public.nutrition_goals;
create policy "nutrition_goals: select own or as coach"
  on public.nutrition_goals for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = nutrition_goals.user_id and cl.status = 'accepted'
    )
  );

drop policy if exists "nutrition_goals: write own" on public.nutrition_goals;
create policy "nutrition_goals: write own"
  on public.nutrition_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Refeições registradas ao longo do dia.
create table if not exists public.nutrition_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  meal_type text not null check (meal_type in ('cafe_da_manha', 'almoco', 'lanche', 'jantar', 'outro')),
  name text not null,
  calories integer,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.nutrition_meals enable row level security;

drop policy if exists "nutrition_meals: select own or as coach" on public.nutrition_meals;
create policy "nutrition_meals: select own or as coach"
  on public.nutrition_meals for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = nutrition_meals.user_id and cl.status = 'accepted'
    )
  );

drop policy if exists "nutrition_meals: write own" on public.nutrition_meals;
create policy "nutrition_meals: write own"
  on public.nutrition_meals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists nutrition_meals_user_date_idx on public.nutrition_meals (user_id, entry_date);

-- Água registrada em "doses" (cada toque em "+ copo" vira uma linha) — soma
-- por dia calculada na hora de exibir, não guardada como total agregado.
create table if not exists public.nutrition_water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  amount_ml integer not null check (amount_ml > 0),
  logged_at timestamptz not null default now()
);

alter table public.nutrition_water_logs enable row level security;

drop policy if exists "nutrition_water_logs: select own or as coach" on public.nutrition_water_logs;
create policy "nutrition_water_logs: select own or as coach"
  on public.nutrition_water_logs for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = nutrition_water_logs.user_id and cl.status = 'accepted'
    )
  );

drop policy if exists "nutrition_water_logs: write own" on public.nutrition_water_logs;
create policy "nutrition_water_logs: write own"
  on public.nutrition_water_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists nutrition_water_user_date_idx on public.nutrition_water_logs (user_id, entry_date);

-- ============================================================
-- Revisão de segurança (pré-lançamento fechado) — achado real:
--
-- A policy "coach_links: respond as counterparty" (UPDATE) só exige, no
-- WITH CHECK, que o status final seja 'accepted'/'rejected' — não trava
-- coach_id/athlete_id/requested_by. RLS não compara a linha antes/depois
-- sozinha (USING vê a linha antiga, WITH CHECK vê só a nova), então nada
-- impedia alguém que é parte de QUALQUER vínculo pendente (inclusive um
-- criado por ele mesmo com uma segunda conta) de, numa chamada direta à
-- API do Supabase por fora do app, trocar athlete_id/coach_id pra
-- apontar pra outra pessoa e já mandar status='accepted' junto — criando
-- um vínculo de treinador sem consentimento real da vítima, com acesso de
-- leitura a tudo que o Coach lê (Health, Nutrition, Vision, Treinos...).
--
-- Trigger em vez de tentar expressar isso só com policy: é o jeito
-- padrão de travar "essa coluna não muda depois de criada" no Postgres,
-- já que USING/WITH CHECK não têm acesso simultâneo a OLD e NEW.
create or replace function public.prevent_coach_link_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.coach_id <> old.coach_id or new.athlete_id <> old.athlete_id or new.requested_by <> old.requested_by then
    raise exception 'COACH_LINK_IDENTIDADE_IMUTAVEL' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists coach_links_prevent_identity_change on public.coach_links;
create trigger coach_links_prevent_identity_change
  before update on public.coach_links
  for each row execute procedure public.prevent_coach_link_identity_change();

-- ============================================================
-- Maverick Admin — painel só de leitura pra quem administra o app (não é
-- um papel de usuário como Coach, é operacional/suporte). De propósito
-- SEM nenhuma policy de insert/update/delete pro papel "authenticated" em
-- app_admins — mesmo raciocínio de strava_connections: só dá pra virar
-- admin por uma ação direta no banco (SQL Editor / API de management),
-- nunca pelo próprio app. Sem isso, o mesmo tipo de furo que corrigimos em
-- coach_links (alguém se autoconceder acesso via chamada direta à API)
-- seria trivial de reproduzir aqui — só que pra TODOS os dados, não um.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
-- Nenhuma policy criada — ninguém autenticado lê nem escreve essa tabela
-- pelo cliente. is_app_admin() abaixo é security definer justamente pra
-- poder consultar sem depender de uma policy de select aqui.

create or replace function public.is_app_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;

-- Só pra tela de admin poder perguntar "eu sou admin?" sem dar select
-- direto em app_admins — devolve só um boolean, nunca a lista de quem é.
create or replace function public.am_i_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_app_admin()
$$;

grant execute on function public.am_i_admin() to authenticated;

-- Uma policy extra de SELECT por tabela — mesmo padrão das policies "as
-- coach", só que sem precisar de vínculo nenhum. Nunca WRITE (a decisão
-- do produto foi só leitura) — strava_connections (tokens OAuth) fica de
-- fora de propósito, igual já fica pro Coach.
drop policy if exists "profiles: select as admin" on public.profiles;
create policy "profiles: select as admin"
  on public.profiles for select
  using (public.is_app_admin());

drop policy if exists "health_entries: select as admin" on public.health_entries;
create policy "health_entries: select as admin"
  on public.health_entries for select
  using (public.is_app_admin());

drop policy if exists "mission_habits: select as admin" on public.mission_habits;
create policy "mission_habits: select as admin"
  on public.mission_habits for select
  using (public.is_app_admin());

drop policy if exists "mission_completions: select as admin" on public.mission_completions;
create policy "mission_completions: select as admin"
  on public.mission_completions for select
  using (public.is_app_admin());

drop policy if exists "vision_photos: select as admin" on public.vision_photos;
create policy "vision_photos: select as admin"
  on public.vision_photos for select
  using (public.is_app_admin());

drop policy if exists "vision_analyses: select as admin" on public.vision_analyses;
create policy "vision_analyses: select as admin"
  on public.vision_analyses for select
  using (public.is_app_admin());

drop policy if exists "vision-photos: select as admin" on storage.objects;
create policy "vision-photos: select as admin"
  on storage.objects for select
  using (bucket_id = 'vision-photos' and public.is_app_admin());

drop policy if exists "workout_plans: select as admin" on public.workout_plans;
create policy "workout_plans: select as admin"
  on public.workout_plans for select
  using (public.is_app_admin());

drop policy if exists "workout_plan_days: select as admin" on public.workout_plan_days;
create policy "workout_plan_days: select as admin"
  on public.workout_plan_days for select
  using (public.is_app_admin());

drop policy if exists "workout_plan_exercises: select as admin" on public.workout_plan_exercises;
create policy "workout_plan_exercises: select as admin"
  on public.workout_plan_exercises for select
  using (public.is_app_admin());

drop policy if exists "workout_logs: select as admin" on public.workout_logs;
create policy "workout_logs: select as admin"
  on public.workout_logs for select
  using (public.is_app_admin());

drop policy if exists "workout_log_sets: select as admin" on public.workout_log_sets;
create policy "workout_log_sets: select as admin"
  on public.workout_log_sets for select
  using (public.is_app_admin());

drop policy if exists "nutrition_goals: select as admin" on public.nutrition_goals;
create policy "nutrition_goals: select as admin"
  on public.nutrition_goals for select
  using (public.is_app_admin());

drop policy if exists "nutrition_meals: select as admin" on public.nutrition_meals;
create policy "nutrition_meals: select as admin"
  on public.nutrition_meals for select
  using (public.is_app_admin());

drop policy if exists "nutrition_water_logs: select as admin" on public.nutrition_water_logs;
create policy "nutrition_water_logs: select as admin"
  on public.nutrition_water_logs for select
  using (public.is_app_admin());

drop policy if exists "strava_activities: select as admin" on public.strava_activities;
create policy "strava_activities: select as admin"
  on public.strava_activities for select
  using (public.is_app_admin());

-- Maverick Core — schema do módulo Brick/Taper (Fase "Coach de endurance")
--
-- Única peça de dado nova de toda essa fase (brick em si é detectado
-- automaticamente em cima do que o Strava já sincroniza — ver
-- src/lib/brickWorkouts.ts) — o taper precisa saber QUANDO é a prova, e
-- isso não dá pra derivar de nada que já existe.
create table if not exists public.upcoming_races (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  sport text not null default 'triatlo',
  race_date date not null,
  created_at timestamptz not null default now()
);

alter table public.upcoming_races enable row level security;

drop policy if exists "upcoming_races: select own or as coach" on public.upcoming_races;
create policy "upcoming_races: select own or as coach"
  on public.upcoming_races for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = upcoming_races.user_id and cl.status = 'accepted'
    )
  );

drop policy if exists "upcoming_races: insert own" on public.upcoming_races;
create policy "upcoming_races: insert own"
  on public.upcoming_races for insert
  with check (auth.uid() = user_id);

drop policy if exists "upcoming_races: update own" on public.upcoming_races;
create policy "upcoming_races: update own"
  on public.upcoming_races for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "upcoming_races: delete own" on public.upcoming_races;
create policy "upcoming_races: delete own"
  on public.upcoming_races for delete
  using (auth.uid() = user_id);

create index if not exists upcoming_races_user_date_idx on public.upcoming_races (user_id, race_date);

drop policy if exists "upcoming_races: select as admin" on public.upcoming_races;
create policy "upcoming_races: select as admin"
  on public.upcoming_races for select
  using (public.is_app_admin());

-- Maverick Core — schema de notificações proativas
--
-- push_tokens: token de push da Expo por aparelho. unique(user_id, token)
-- em vez de unique(token) sozinho — de propósito: um aparelho compartilhado
-- entre duas contas não deve dar erro de conflito ao registrar o segundo
-- usuário (ver comentário completo em src/lib/notifications.ts).
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null default 'unknown',
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens: select own" on public.push_tokens;
create policy "push_tokens: select own"
  on public.push_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "push_tokens: insert own" on public.push_tokens;
create policy "push_tokens: insert own"
  on public.push_tokens for insert
  with check (auth.uid() = user_id);

drop policy if exists "push_tokens: update own" on public.push_tokens;
create policy "push_tokens: update own"
  on public.push_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_tokens: delete own" on public.push_tokens;
create policy "push_tokens: delete own"
  on public.push_tokens for delete
  using (auth.uid() = user_id);

-- notification_log: histórico de avisos já enviados — a Edge Function
-- notify-athletes usa isso pra não mandar o mesmo aviso todo dia enquanto
-- a condição persistir (ex.: prontidão baixa por uma semana inteira vira
-- UM aviso, não sete). Só a service_role escreve aqui (a Edge Function
-- roda com esse client) — o usuário só pode LER o próprio histórico.
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null,
  sent_at timestamptz not null default now()
);

alter table public.notification_log enable row level security;

drop policy if exists "notification_log: select own" on public.notification_log;
create policy "notification_log: select own"
  on public.notification_log for select
  using (auth.uid() = user_id);

create index if not exists notification_log_user_type_idx on public.notification_log (user_id, notification_type, sent_at desc);

-- Maverick Dor/Desconforto — registro de dor ou desconforto ligado (ou
-- não) a um exercício específico. Existe pra validar de verdade se os
-- alertas de risco de carga (ACWR/deload — ver trainingLoad.ts,
-- periodization.ts) estão evitando lesão: sem esse dado, "deload
-- recomendado" é só uma hipótese; com ele, dá pra cruzar "teve dor" com
-- "estava em risco alto" e ver se o alerta realmente antecipa o
-- problema. Mesmo padrão de RLS de workout_logs: o próprio atleta lê/
-- escreve, o treinador vinculado (accepted) só lê.
create table if not exists public.pain_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null default current_date,
  body_part text not null,
  exercise_id uuid references public.exercises (id) on delete set null,
  severity integer not null check (severity between 1 and 10),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.pain_logs enable row level security;

drop policy if exists "pain_logs: select own or as coach" on public.pain_logs;
create policy "pain_logs: select own or as coach"
  on public.pain_logs for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.coach_links cl
      where cl.coach_id = auth.uid() and cl.athlete_id = pain_logs.user_id and cl.status = 'accepted'
    )
  );

drop policy if exists "pain_logs: insert own" on public.pain_logs;
create policy "pain_logs: insert own"
  on public.pain_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "pain_logs: update own" on public.pain_logs;
create policy "pain_logs: update own"
  on public.pain_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "pain_logs: delete own" on public.pain_logs;
create policy "pain_logs: delete own"
  on public.pain_logs for delete
  using (auth.uid() = user_id);

create index if not exists pain_logs_user_date_idx on public.pain_logs (user_id, entry_date desc);
