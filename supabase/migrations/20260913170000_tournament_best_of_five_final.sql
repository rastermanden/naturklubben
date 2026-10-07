-- Turnering: finalen spilles bedst af fem.
--
-- Alle kampe har hidtil været bedst af tre, og både skemaet og RPC'en gik ud
-- fra det: `game_number` kunne kun være 1-3, og vinderen var den første med
-- 2 spilsejre. Finalen skal nu være bedst af fem, så begge dele skal vide,
-- hvor mange spil netop dén kamp går over.
--
-- `best_of` står på kampen selv fremfor at blive udledt (fx "den sidste
-- runde i en single elimination"): kampplanen laves i klienten, som allerede
-- ved, hvilken kamp der er finalen, og en kamp, der bærer sin egen regel,
-- kan ikke komme til at blive målt efter en anden.

alter table public.tournament_matches
  add column best_of smallint not null default 3 check (best_of in (3, 5));

-- Bedst af fem kræver plads til to spil mere.
alter table public.tournament_games
  drop constraint tournament_games_game_number_check;
alter table public.tournament_games
  add constraint tournament_games_game_number_check
  check (game_number between 1 and 5);

-- create_tournament_with_matches skal sætte den nye kolonne, som klientens
-- kampplan sender med for hver kamp.
create or replace function public.create_tournament_with_matches(
  p_format text,
  p_participants jsonb,
  p_matches jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tournament_id uuid;
begin
  insert into public.tournaments (format, status, created_by)
  values (p_format, 'in_progress', auth.uid())
  returning id into v_tournament_id;

  insert into public.tournament_participants
    (id, tournament_id, user_id, display_name, seed)
  select
    (p->>'id')::uuid,
    v_tournament_id,
    (p->>'user_id')::uuid,
    p->>'display_name',
    (p->>'seed')::integer
  from jsonb_array_elements(p_participants) as p;

  insert into public.tournament_matches
    (id, tournament_id, round, match_index, participant1_id,
     participant2_id, winner_id, status, next_match_id, next_match_slot, bye,
     best_of)
  select
    (m->>'id')::uuid,
    v_tournament_id,
    (m->>'round')::integer,
    (m->>'match_index')::integer,
    (m->>'participant1_id')::uuid,
    (m->>'participant2_id')::uuid,
    (m->>'winner_id')::uuid,
    m->>'status',
    (m->>'next_match_id')::uuid,
    (m->>'next_match_slot')::smallint,
    coalesce((m->>'bye')::boolean, false),
    coalesce((m->>'best_of')::smallint, 3)
  from jsonb_array_elements(p_matches) as m;

  return v_tournament_id;
end;
$$;

-- record_tournament_match_result skal måle kampen efter dens egen `best_of`:
-- bedst af tre afgøres ved 2 spilsejre, bedst af fem ved 3. Rækkefølgen af
-- tjekkene er den samme som før (se 20260913160000): det, der er galt med
-- selve indtastningen, kommer før kampens tilstand -- men antallet af
-- nødvendige sejre skal slås op på kampen først, så beskeden kan nævne det
-- rigtige tal.
create or replace function public.record_tournament_match_result(
  p_match_id uuid,
  p_game_winner_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_winner_id uuid;
  v_status text;
  v_participant1_id uuid;
  v_participant2_id uuid;
  v_bye boolean;
  v_best_of smallint;
  v_games_to_win smallint;
  v_tournament_id uuid;
  v_next_match_id uuid;
  v_next_match_slot smallint;
  v_next_bye boolean;
  v_next_next_match_id uuid;
  v_next_next_slot smallint;
  v_format text;
  v_pending_count integer;
begin
  select status, participant1_id, participant2_id, bye, best_of
  into v_status, v_participant1_id, v_participant2_id, v_bye, v_best_of
  from public.tournament_matches
  where id = p_match_id;

  if not found then
    raise exception 'Ukendt kamp' using errcode = 'P0002';
  end if;

  v_games_to_win := v_best_of / 2 + 1;

  select participant_id into v_winner_id
  from unnest(p_game_winner_ids) as participant_id
  group by participant_id
  having count(*) >= v_games_to_win
  limit 1;

  if v_winner_id is null then
    raise exception 'Kampen kan ikke afgøres uden en vinder af % spil',
      v_games_to_win using errcode = '22023';
  end if;

  if coalesce(array_length(p_game_winner_ids, 1), 0) > v_best_of then
    raise exception 'En kamp er højst % spil', v_best_of using errcode = '22023';
  end if;

  if v_status <> 'pending' then
    raise exception 'Kampen er allerede afgjort' using errcode = '22023';
  end if;

  if v_bye then
    raise exception 'En bye afgøres automatisk og kan ikke tastes ind'
      using errcode = '22023';
  end if;

  if v_participant1_id is null or v_participant2_id is null then
    raise exception 'Kampen mangler stadig en deltager' using errcode = '22023';
  end if;

  insert into public.tournament_games (match_id, game_number, winner_id)
  select p_match_id, gen.ordinality::smallint, gen.winner_id
  from unnest(p_game_winner_ids) with ordinality as gen(winner_id, ordinality);

  update public.tournament_matches
  set status = 'completed', winner_id = v_winner_id
  where id = p_match_id
  returning tournament_id, next_match_id, next_match_slot
    into v_tournament_id, v_next_match_id, v_next_match_slot;

  -- Rykker vinderen videre til næste kamp. Er den kamp selv en bye (dens
  -- anden plads bliver aldrig udfyldt af nogen anden kamp), er den dermed
  -- afgjort med det samme -- og vinderen skal rykkes videre igen, muligvis
  -- flere gange i træk, hvis flere byes følger lige efter hinanden.
  while v_next_match_id is not null loop
    if v_next_match_slot = 1 then
      update public.tournament_matches
      set participant1_id = v_winner_id
      where id = v_next_match_id;
    else
      update public.tournament_matches
      set participant2_id = v_winner_id
      where id = v_next_match_id;
    end if;

    select bye, next_match_id, next_match_slot
    into v_next_bye, v_next_next_match_id, v_next_next_slot
    from public.tournament_matches
    where id = v_next_match_id;

    exit when not v_next_bye;

    update public.tournament_matches
    set status = 'completed', winner_id = v_winner_id
    where id = v_next_match_id;

    v_next_match_id := v_next_next_match_id;
    v_next_match_slot := v_next_next_slot;
  end loop;

  select format into v_format
  from public.tournaments
  where id = v_tournament_id;

  if v_format = 'single_elimination' then
    if v_next_match_id is null then
      update public.tournaments
      set status = 'completed'
      where id = v_tournament_id;
    end if;
  else
    select count(*) into v_pending_count
    from public.tournament_matches
    where tournament_id = v_tournament_id and status = 'pending';

    if v_pending_count = 0 then
      update public.tournaments
      set status = 'completed'
      where id = v_tournament_id;
    end if;
  end if;
end;
$$;

insert into public.feature_announcements (slug, title, body, path)
values (
  'turnering-finale-bedst-af-fem',
  'Finalen går nu over fem spil',
  'I udslagsrunder afgøres finalen nu bedst af fem spil -- resten af '
  || 'kampene er stadig bedst af tre. Reglerne står nu øverst på '
  || 'turneringen, så I kan slå dem op midt i det hele.',
  'turnering'
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
