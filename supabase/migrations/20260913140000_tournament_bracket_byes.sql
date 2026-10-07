-- Turnering: spred byes ud over runderne i stedet for at samle dem alle i
-- runde 1.
--
-- Den gamle bracket-generering polstrede deltagerantallet op til nærmeste
-- potens af to og placerede alle byes i runde 1 -- 5 deltagere blev til en
-- bracket for 8, altså 3 byes, selvom kun 3 kampe reelt manglede en
-- modstander. Den nye generering (bracket.ts) fordeler byes runde for
-- runde i stedet (5 deltagere giver nu 1 bye i runde 1 og 1 i runde 2), men
-- kan kun afgøre en bye i runde 1 med det samme -- hvem der lander i en
-- bye i en senere runde, afhænger af kampe, der endnu ikke er spillet.
--
-- Sådan en kamp oprettes derfor som en almindelig, tom kamp med den nye
-- `bye`-markering: dens anden plads bliver aldrig udfyldt af nogen anden
-- kamp (kun runde 1-byes forbliver `participant2_id is null` uden
-- markeringen, som før). RPC'erne herunder holder den markering ajour: så
-- snart en bye-kamps ene plads bliver udfyldt, afgøres den automatisk, og
-- vinderen rykkes videre -- eventuelt gennem flere byes i træk.

alter table public.tournament_matches
  add column bye boolean not null default false;

-- Kun kampe, hvor `participant2_id` aldrig bliver udfyldt, må være en bye --
-- ellers ville en fremtidig kamp med to rigtige deltagere kunne blive
-- fejlagtigt afgjort med det samme af kaskade-logikken herunder.
alter table public.tournament_matches
  add constraint tournament_matches_bye_has_no_second_participant
  check (not bye or participant2_id is null);

-- Eksisterende turneringers runde 1-byes (den eneste slags, den gamle
-- generering nogensinde lavede) markeres, så BracketView kan bruge den
-- rigtige kolonne fremfor at gætte ud fra status.
update public.tournament_matches
set bye = true
where participant2_id is null and status = 'completed';

-- create_tournament_with_matches skal nu også sætte den nye `bye`-kolonne,
-- som klientens bracket-generering sender med for hver kamp.
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
     participant2_id, winner_id, status, next_match_id, next_match_slot, bye)
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
    coalesce((m->>'bye')::boolean, false)
  from jsonb_array_elements(p_matches) as m;

  return v_tournament_id;
end;
$$;

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
  v_tournament_id uuid;
  v_next_match_id uuid;
  v_next_match_slot smallint;
  v_next_bye boolean;
  v_next_next_match_id uuid;
  v_next_next_slot smallint;
  v_format text;
  v_pending_count integer;
begin
  select participant_id into v_winner_id
  from unnest(p_game_winner_ids) as participant_id
  group by participant_id
  having count(*) >= 2
  limit 1;

  if v_winner_id is null then
    raise exception 'Kampen kan ikke afgøres uden en vinder af 2 spil'
      using errcode = '22023';
  end if;

  insert into public.tournament_games (match_id, game_number, winner_id)
  select p_match_id, gen.ordinality::smallint, gen.winner_id
  from unnest(p_game_winner_ids) with ordinality as gen(winner_id, ordinality);

  update public.tournament_matches
  set status = 'completed', winner_id = v_winner_id
  where id = p_match_id
  returning tournament_id, next_match_id, next_match_slot
    into v_tournament_id, v_next_match_id, v_next_match_slot;

  if not found then
    raise exception 'Ukendt kamp' using errcode = 'P0002';
  end if;

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

create or replace function public.undo_tournament_match_result(p_match_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_participant2_id uuid;
  v_next_match_id uuid;
  v_next_match_slot smallint;
  v_tournament_id uuid;
  v_next_match_status text;
  v_next_bye boolean;
  v_next_next_match_id uuid;
  v_next_next_slot smallint;
begin
  select status, participant2_id, next_match_id, next_match_slot, tournament_id
  into v_status, v_participant2_id, v_next_match_id, v_next_match_slot,
    v_tournament_id
  from public.tournament_matches
  where id = p_match_id;

  if not found then
    raise exception 'Ukendt kamp' using errcode = 'P0002';
  end if;

  if v_status <> 'completed' then
    raise exception 'Kampen er ikke afgjort endnu' using errcode = '22023';
  end if;

  if v_participant2_id is null then
    raise exception 'En bye kan ikke fortrydes' using errcode = '22023';
  end if;

  -- Går kæden af efterfølgende kamp(e) igennem én eller flere byes, der kun
  -- er afgjort som en automatisk konsekvens af netop dette resultat, ryddes
  -- de også, og fortrydelsen fortsætter til den kamp, der reelt har et
  -- resultat at beskytte (eller til enden af bracketten).
  while v_next_match_id is not null loop
    select status, bye, next_match_id, next_match_slot
    into v_next_match_status, v_next_bye, v_next_next_match_id, v_next_next_slot
    from public.tournament_matches
    where id = v_next_match_id;

    if v_next_match_status = 'completed' and not v_next_bye then
      raise exception
        'Den efterfølgende kamp er allerede afgjort -- fortryd den først'
        using errcode = '22023';
    end if;

    if v_next_match_slot = 1 then
      update public.tournament_matches
      set participant1_id = null
      where id = v_next_match_id;
    else
      update public.tournament_matches
      set participant2_id = null
      where id = v_next_match_id;
    end if;

    exit when v_next_match_status <> 'completed';

    update public.tournament_matches
    set status = 'pending', winner_id = null
    where id = v_next_match_id;

    v_next_match_id := v_next_next_match_id;
    v_next_match_slot := v_next_next_slot;
  end loop;

  delete from public.tournament_games where match_id = p_match_id;

  update public.tournament_matches
  set status = 'pending', winner_id = null
  where id = p_match_id;

  update public.tournaments
  set status = 'in_progress'
  where id = v_tournament_id and status = 'completed';
end;
$$;

notify pgrst, 'reload schema';
