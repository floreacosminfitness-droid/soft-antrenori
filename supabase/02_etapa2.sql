-- =====================================================================
-- Soft antrenori — ETAPA 2: ținte puse de antrenor + planul clientului
-- Rulează după 01_fundatia.sql. Se poate rula de mai multe ori.
--
--   client_targets     caloriile și macro-urile stabilite de antrenor
--   target_proposals   propuneri de ajustare (greutatea stă pe loc etc.)
--   food_products      produse scanate cu codul de bare (comune tuturor)
--   meal_content       rețetele și alimentele (încărcate separat)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ȚINTELE CLIENTULUI (le scrie doar antrenorul lui)
-- ---------------------------------------------------------------------
create table if not exists public.client_targets (
  client_id   uuid primary key references public.clients(id) on delete cascade,
  kcal        int  not null check (kcal between 800 and 6000),
  p           int  not null check (p between 0 and 500),
  c           int  not null check (c between 0 and 900),
  f           int  not null check (f between 0 and 400),
  calc        jsonb,          -- datele folosite în calculator și modul ales (grame/procente/g pe kg)
  set_by      uuid default auth.uid() references public.trainers(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.client_targets enable row level security;
revoke all on public.client_targets from anon, authenticated;
grant select, insert, update on public.client_targets to authenticated;

drop policy if exists ct_select on public.client_targets;
create policy ct_select on public.client_targets for select to authenticated
  using (client_id = auth.uid() or public.is_my_client(client_id));
drop policy if exists ct_insert on public.client_targets;
create policy ct_insert on public.client_targets for insert to authenticated
  with check (public.is_my_client(client_id) and set_by = auth.uid());
drop policy if exists ct_update on public.client_targets;
create policy ct_update on public.client_targets for update to authenticated
  using (public.is_my_client(client_id))
  with check (public.is_my_client(client_id) and set_by = auth.uid());

-- ---------------------------------------------------------------------
-- 2. PROPUNERI DE AJUSTARE
--    Le creează pagina clientului la 2 săptămâni, după greutate.
--    Antrenorul le acceptă (își schimbă singur țintele) sau le respinge.
-- ---------------------------------------------------------------------
create table if not exists public.target_proposals (
  id           bigint generated always as identity primary key,
  client_id    uuid not null default auth.uid() references public.clients(id) on delete cascade,
  created_on   date not null default current_date,
  change       int  not null check (change between -500 and 500),
  reason       text not null check (char_length(reason) <= 400),
  from_kg      numeric(5,1),
  to_kg        numeric(5,1),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  resolved_at  timestamptz,
  unique (client_id, created_on)
);
create index if not exists target_proposals_client_idx on public.target_proposals (client_id, status);

alter table public.target_proposals enable row level security;
revoke all on public.target_proposals from anon, authenticated;
grant select, insert on public.target_proposals to authenticated;
grant update (status) on public.target_proposals to authenticated;

drop policy if exists tp_select on public.target_proposals;
create policy tp_select on public.target_proposals for select to authenticated
  using (client_id = auth.uid() or public.is_my_client(client_id));
drop policy if exists tp_insert on public.target_proposals;
create policy tp_insert on public.target_proposals for insert to authenticated
  with check (client_id = auth.uid() and public.is_client() and status = 'pending');
drop policy if exists tp_update on public.target_proposals;
create policy tp_update on public.target_proposals for update to authenticated
  using (public.is_my_client(client_id))
  with check (public.is_my_client(client_id));

create or replace function public.target_proposals_resolve()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status <> old.status then
    new.resolved_at := case when new.status = 'pending' then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists target_proposals_resolve on public.target_proposals;
create trigger target_proposals_resolve before update on public.target_proposals
  for each row execute function public.target_proposals_resolve();
revoke execute on function public.target_proposals_resolve() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. PRODUSE CU COD DE BARE (comune: ce adaugă un client, găsesc și ceilalți)
-- ---------------------------------------------------------------------
create table if not exists public.food_products (
  code        text primary key check (code ~ '^\d{8}$|^\d{12,14}$'),
  name        text not null check (char_length(name) between 1 and 120),
  kcal        numeric(6,1) not null check (kcal between 0 and 950),
  p           numeric(5,1) not null default 0 check (p between 0 and 100),
  c           numeric(5,1) not null default 0 check (c between 0 and 100),
  f           numeric(5,1) not null default 0 check (f between 0 and 100),
  fib         numeric(5,1) not null default 0 check (fib between 0 and 100),
  added_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.food_products enable row level security;
revoke all on public.food_products from anon, authenticated;
grant select, insert on public.food_products to authenticated;

drop policy if exists fp_select on public.food_products;
create policy fp_select on public.food_products for select to authenticated using (true);
drop policy if exists fp_insert on public.food_products;
create policy fp_insert on public.food_products for insert to authenticated
  with check (added_by = auth.uid() and public.is_client());

-- ---------------------------------------------------------------------
-- 4. Clientul poate citi rețetele doar dacă e client sau antrenor (nu orice cont)
-- ---------------------------------------------------------------------
drop policy if exists meal_content_read on public.meal_content;
create policy meal_content_read on public.meal_content for select to authenticated
  using (public.is_client() or exists (select 1 from public.trainers where id = auth.uid()));
