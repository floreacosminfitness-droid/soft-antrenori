-- =====================================================================
-- Soft antrenori — CHECK-IN: poze de progres + măsurători (opționale)
-- Rulează după 02_etapa2.sql. Se poate rula de mai multe ori.
-- Pozele stau într-un spațiu PRIVAT: le vede doar clientul și antrenorul lui,
-- prin linkuri temporare (expiră într-o oră).
-- =====================================================================

create table if not exists public.checkins (
  id          bigint generated always as identity primary key,
  client_id   uuid not null default auth.uid() references public.clients(id) on delete cascade,
  taken_on    date not null default current_date,
  weight_kg   numeric(5,1) check (weight_kg is null or weight_kg between 30 and 300),
  waist       numeric(5,1) check (waist is null or waist between 10 and 300),
  hips        numeric(5,1) check (hips  is null or hips  between 10 and 300),
  chest       numeric(5,1) check (chest is null or chest between 10 and 300),
  arm         numeric(5,1) check (arm   is null or arm   between 10 and 300),
  thigh       numeric(5,1) check (thigh is null or thigh between 10 and 300),
  note        text check (note is null or char_length(note) <= 500),
  photos      jsonb not null default '[]'::jsonb,   -- [{ "pose": "front|side|back", "path": "<client_id>/<fișier>.jpg" }]
  created_at  timestamptz not null default now()
);
create index if not exists checkins_client_idx on public.checkins (client_id, taken_on);

alter table public.checkins enable row level security;
revoke all on public.checkins from anon, authenticated;
grant select, insert, update, delete on public.checkins to authenticated;

drop policy if exists ck_select on public.checkins;
create policy ck_select on public.checkins for select to authenticated
  using (client_id = auth.uid() or public.is_my_client(client_id));
drop policy if exists ck_insert on public.checkins;
create policy ck_insert on public.checkins for insert to authenticated
  with check (client_id = auth.uid() and public.is_client());
drop policy if exists ck_update on public.checkins;
create policy ck_update on public.checkins for update to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists ck_delete on public.checkins;
create policy ck_delete on public.checkins for delete to authenticated
  using (client_id = auth.uid());

-- E dosarul (primul segment din cale) al unui client de-al antrenorului logat?
create or replace function public.is_my_client_folder(folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clients where id::text = folder and trainer_id = auth.uid());
$$;
revoke execute on function public.is_my_client_folder(text) from public, anon;
grant  execute on function public.is_my_client_folder(text) to authenticated;

-- Spațiul pentru poze: privat, max 5 MB pe poză, doar imagini
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkins', 'checkins', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists checkins_insert on storage.objects;
create policy checkins_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'checkins' and (storage.foldername(name))[1] = auth.uid()::text and public.is_client());

drop policy if exists checkins_select on storage.objects;
create policy checkins_select on storage.objects for select to authenticated
  using (bucket_id = 'checkins' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_my_client_folder((storage.foldername(name))[1])
  ));

drop policy if exists checkins_delete on storage.objects;
create policy checkins_delete on storage.objects for delete to authenticated
  using (bucket_id = 'checkins' and (storage.foldername(name))[1] = auth.uid()::text);
