-- =====================================================================
-- Soft antrenori — ETAPA 1: FUNDAȚIA
-- Rulează o singură dată în proiectul Supabase NOU (SQL Editor → New query
-- → lipește tot fișierul → Run). Nu rula în proiectul COS FIT.
--
-- Ce face:
--   1. Două roluri: antrenor (tabelul trainers) și client (tabelul clients).
--   2. Clientul e legat de antrenorul lui prin codul de invitare din link.
--   3. Fiecare antrenor vede doar clienții lui și datele lor (Row Level Security).
--   4. Tabelele de date ale clientului (profil plan, planuri, greutate),
--      cu aceleași coloane ca în COS FIT, ca motorul de planuri să meargă direct.
--   5. Spațiu pentru logo-urile antrenorilor (bucket "logos").
--
-- Rolul unui cont NU se citește din datele trimise la înscriere după ce contul
-- există: se decide o singură dată, la creare, și rămâne în tabele.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ANTRENORI ȘI CLIENȚI
-- ---------------------------------------------------------------------

create table if not exists public.trainers (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 80),
  logo_url      text check (logo_url is null or char_length(logo_url) <= 500),
  invite_code   text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  created_at    timestamptz not null default now()
);

create table if not exists public.clients (
  id            uuid primary key references auth.users(id) on delete cascade,
  -- restrict: un antrenor nu poate fi șters cât timp are clienți (nu pierdem date din greșeală)
  trainer_id    uuid not null references public.trainers(id) on delete restrict,
  full_name     text not null check (char_length(full_name) between 2 and 80),
  status        text not null default 'active' check (status in ('active', 'archived')),
  joined_at     timestamptz not null default now(),
  archived_at   timestamptz,
  last_seen_at  timestamptz
);

create index if not exists clients_trainer_idx on public.clients (trainer_id);


-- Cod de invitare: 6 caractere, fără litere ușor de confundat (O/0, I/1)
create or replace function public.new_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.trainers where invite_code = code);
  end loop;
  return code;
end;
$$;


-- La crearea unui cont: devine antrenor sau client, după datele de înscriere.
--   antrenor: { role: 'trainer', name }
--   client:   { role: 'client',  name, invite_code }
-- Un cod greșit oprește crearea contului (pagina verifică codul înainte, deci
-- clientul vede de obicei mesajul prietenos de acolo, nu eroarea asta).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r     text  := meta->>'role';
  nm    text  := left(btrim(coalesce(meta->>'name', '')), 80);
  t_id  uuid;
begin
  if r = 'trainer' then
    if char_length(nm) < 2 then
      raise exception 'NUME_LIPSA';
    end if;
    insert into public.trainers (id, display_name, invite_code)
    values (new.id, nm, public.new_invite_code());

  elsif r = 'client' then
    select id into t_id
    from public.trainers
    where invite_code = upper(btrim(coalesce(meta->>'invite_code', '')));
    if t_id is null then
      raise exception 'COD_INVITARE_INVALID';
    end if;
    if char_length(nm) < 2 then
      raise exception 'NUME_LIPSA';
    end if;
    insert into public.clients (id, trainer_id, full_name)
    values (new.id, t_id, nm);
  end if;
  -- fără rol (de ex. cont creat de tine din panoul Supabase): nu se întâmplă nimic

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 2. FUNCȚII AJUTĂTOARE (folosite de reguli și de pagini)
-- ---------------------------------------------------------------------

-- E clientul ăsta al antrenorului logat? (inclusiv clienți arhivați: istoricul rămâne)
create or replace function public.is_my_client(client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients
    where id = client_id and trainer_id = auth.uid()
  );
$$;

-- E contul logat un client?
create or replace function public.is_client()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.clients where id = auth.uid());
$$;

-- Cine sunt? Paginile o apelează după intrare ca să știe unde să te ducă.
create or replace function public.my_account()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
        'role', 'trainer',
        'trainer', jsonb_build_object(
          'id', t.id, 'display_name', t.display_name,
          'logo_url', t.logo_url, 'invite_code', t.invite_code)
      )
     from public.trainers t where t.id = auth.uid()),
    (select jsonb_build_object(
        'role', 'client',
        'client', jsonb_build_object(
          'id', c.id, 'full_name', c.full_name, 'status', c.status, 'joined_at', c.joined_at),
        'trainer', jsonb_build_object(
          'display_name', t.display_name, 'logo_url', t.logo_url)
      )
     from public.clients c join public.trainers t on t.id = c.trainer_id
     where c.id = auth.uid()),
    jsonb_build_object('role', null)
  );
$$;

-- Pentru pagina de înscriere (fără cont): numele și logo-ul antrenorului după cod.
create or replace function public.trainer_public(code text)
returns table (display_name text, logo_url text)
language sql
stable
security definer
set search_path = public
as $$
  select t.display_name, t.logo_url
  from public.trainers t
  where t.invite_code = upper(btrim(coalesce(code, '')));
$$;

-- Antrenorul își schimbă codul (link-ul vechi nu mai merge).
create or replace function public.regenerate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c text;
begin
  if not exists (select 1 from public.trainers where id = auth.uid()) then
    raise exception 'DOAR_ANTRENOR';
  end if;
  c := public.new_invite_code();
  update public.trainers set invite_code = c where id = auth.uid();
  return c;
end;
$$;

-- Clientul a intrat în program (pentru „ultima intrare” și alerta de 3 zile).
create or replace function public.touch_last_seen()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.clients set last_seen_at = now() where id = auth.uid();
$$;


-- ---------------------------------------------------------------------
-- 3. REGULI DE ACCES PENTRU ANTRENORI ȘI CLIENȚI
-- ---------------------------------------------------------------------

alter table public.trainers enable row level security;
alter table public.clients  enable row level security;

-- Nimeni nu creează sau șterge rânduri direct; doar prin înscriere (funcția de mai sus).
revoke all on public.trainers from anon, authenticated;
revoke all on public.clients  from anon, authenticated;
grant select on public.trainers to authenticated;
grant select on public.clients  to authenticated;
-- Ce coloane se pot modifica (rândurile sunt limitate de regulile de mai jos):
grant update (display_name, logo_url) on public.trainers to authenticated;
grant update (full_name, status)      on public.clients  to authenticated;

drop policy if exists trainers_select on public.trainers;
create policy trainers_select on public.trainers
  for select to authenticated
  using (
    id = auth.uid()
    or id = (select c.trainer_id from public.clients c where c.id = auth.uid())
  );

drop policy if exists trainers_update on public.trainers;
create policy trainers_update on public.trainers
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated
  using (id = auth.uid() or trainer_id = auth.uid());

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update to authenticated
  using (id = auth.uid() or trainer_id = auth.uid())
  with check (id = auth.uid() or trainer_id = auth.uid());

-- Clientul își poate schimba doar numele; antrenorul doar arhivează/reactivează.
create or replace function public.clients_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if auth.uid() = old.id and new.status is distinct from old.status then
      raise exception 'CLIENTUL_NU_SCHIMBA_STATUSUL';
    end if;
    if auth.uid() = old.trainer_id and auth.uid() <> old.id
       and new.full_name is distinct from old.full_name then
      raise exception 'ANTRENORUL_NU_SCHIMBA_NUMELE';
    end if;
  end if;

  if new.status = 'archived' and old.status <> 'archived' then
    new.archived_at := now();
  elsif new.status = 'active' then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_guard on public.clients;
create trigger clients_guard
  before update on public.clients
  for each row execute function public.clients_guard();


-- ---------------------------------------------------------------------
-- 4. DATELE CLIENTULUI (aceleași coloane ca în COS FIT)
--    Clientul își citește și scrie datele lui.
--    Antrenorul doar citește datele clienților lui.
-- ---------------------------------------------------------------------

-- Rețetele și alimentele (un singur rând, id = 1). Le încarci în etapa 2.
create table if not exists public.meal_content (
  id          int primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.meal_profiles (
  user_id      uuid primary key default auth.uid() references public.clients(id) on delete cascade,
  answers      jsonb not null,
  kcal_adjust  int not null default 0,
  plan_start   date,
  last_adjust  date,
  history      jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now()
);

create table if not exists public.meal_plans (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.clients(id) on delete cascade,
  week_start  date not null,
  targets     jsonb,
  plan        jsonb not null,
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists public.body_weights (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references public.clients(id) on delete cascade,
  measured_on  date not null,
  weight_kg    numeric(5,1) not null check (weight_kg between 30 and 300),
  created_at   timestamptz not null default now(),
  unique (user_id, measured_on)
);
create index if not exists body_weights_user_idx on public.body_weights (user_id, measured_on);

alter table public.meal_content  enable row level security;
alter table public.meal_profiles enable row level security;
alter table public.meal_plans    enable row level security;
alter table public.body_weights  enable row level security;

revoke all on public.meal_content, public.meal_profiles, public.meal_plans, public.body_weights from anon;
revoke insert, update, delete on public.meal_content from authenticated;
grant select on public.meal_content to authenticated;
grant select, insert, update, delete on public.meal_profiles, public.meal_plans, public.body_weights to authenticated;

drop policy if exists meal_content_read on public.meal_content;
create policy meal_content_read on public.meal_content
  for select to authenticated using (true);

-- meal_profiles
drop policy if exists mp_select on public.meal_profiles;
create policy mp_select on public.meal_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_my_client(user_id));
drop policy if exists mp_insert on public.meal_profiles;
create policy mp_insert on public.meal_profiles for insert to authenticated
  with check (user_id = auth.uid() and public.is_client());
drop policy if exists mp_update on public.meal_profiles;
create policy mp_update on public.meal_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists mp_delete on public.meal_profiles;
create policy mp_delete on public.meal_profiles for delete to authenticated
  using (user_id = auth.uid());

-- meal_plans
drop policy if exists pl_select on public.meal_plans;
create policy pl_select on public.meal_plans for select to authenticated
  using (user_id = auth.uid() or public.is_my_client(user_id));
drop policy if exists pl_insert on public.meal_plans;
create policy pl_insert on public.meal_plans for insert to authenticated
  with check (user_id = auth.uid() and public.is_client());
drop policy if exists pl_update on public.meal_plans;
create policy pl_update on public.meal_plans for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists pl_delete on public.meal_plans;
create policy pl_delete on public.meal_plans for delete to authenticated
  using (user_id = auth.uid());

-- body_weights
drop policy if exists bw_select on public.body_weights;
create policy bw_select on public.body_weights for select to authenticated
  using (user_id = auth.uid() or public.is_my_client(user_id));
drop policy if exists bw_insert on public.body_weights;
create policy bw_insert on public.body_weights for insert to authenticated
  with check (user_id = auth.uid() and public.is_client());
drop policy if exists bw_update on public.body_weights;
create policy bw_update on public.body_weights for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists bw_delete on public.body_weights;
create policy bw_delete on public.body_weights for delete to authenticated
  using (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- 5. CINE POATE APELA FUNCȚIILE
-- ---------------------------------------------------------------------

revoke execute on function public.new_invite_code()   from public, anon, authenticated;
revoke execute on function public.handle_new_user()   from public, anon, authenticated;
revoke execute on function public.clients_guard()     from public, anon, authenticated;

revoke execute on function public.my_account()             from public, anon;
revoke execute on function public.regenerate_invite_code() from public, anon;
revoke execute on function public.touch_last_seen()        from public, anon;
revoke execute on function public.is_my_client(uuid)       from public, anon;
revoke execute on function public.is_client()              from public, anon;
grant  execute on function public.my_account()             to authenticated;
grant  execute on function public.regenerate_invite_code() to authenticated;
grant  execute on function public.touch_last_seen()        to authenticated;
grant  execute on function public.is_my_client(uuid)       to authenticated;
grant  execute on function public.is_client()              to authenticated;

revoke execute on function public.trainer_public(text) from public;
grant  execute on function public.trainer_public(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. LOGO-URILE ANTRENORILOR (Storage)
--    Oricine poate vedea un logo (apare pe pagina de înscriere).
--    Fiecare antrenor încarcă doar în dosarul lui: logos/<id-antrenor>/...
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists logos_insert on storage.objects;
create policy logos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.trainers where id = auth.uid())
  );

drop policy if exists logos_update on storage.objects;
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists logos_delete on storage.objects;
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Gata. Verificare rapidă: în Table Editor trebuie să apară trainers, clients,
-- meal_content, meal_profiles, meal_plans, body_weights, toate cu „RLS enabled”.
