-- Turnering: atomiske RPC'er + en integritets-trigger.
--
-- Opsætning og resultatindtastning var hidtil flere separate insert/update-
-- kald fra klienten (se useTournaments.ts/useTournament.ts). Fejler ét
-- skridt undervejs, står turneringen tilbage i en halv, uspilbar tilstand
-- uden oprydning, og et gentaget forsøg kan ramme en duplikat-nøgle-fejl i
-- stedet for bare at fortsætte. De tre RPC'er herunder gør hvert forløb til
-- ét atomisk kald -- samme mønster som fx nominate_member_for_badge og
-- approve_probation_application allerede bruger i denne kodebase.
--
-- RPC'erne er security invoker: de udfører præcis de samme insert/update,
-- som klienten gjorde før, under den kaldende brugers egen rolle -- de
-- eksisterende RLS-policies (uændrede) er stadig det, der reelt afgør, hvad
-- der er tilladt. RPC'en giver kun atomicitet, ikke bredere adgang.

-- En kamps enkeltspil skal handle om kampens egne to deltagere. Det var der
-- ikke noget, der sikrede før -- kun tournament_matches.winner_id var
-- bundet til sine egne participant1_id/participant2_id. En check-constraint
-- kan ikke se andre tabeller, så det kræver en trigger.
create function public.check_tournament_game_winner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant1 uuid;
  v_participant2 uuid;
begin
  select participant1_id, participant2_id
  into v_participant1, v_participant2
  from public.tournament_matches
  where id = new.match_id;

  if not found then
    raise exception 'Ukendt kamp' using errcode = '23503';
  end if;

  if new.winner_id is distinct from v_participant1
     and new.winner_id is distinct from v_participant2 then
    raise exception
      'winner_id skal være en af kampens egne to deltagere'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger tournament_games_winner_is_participant
  before insert or update on public.tournament_games
  for each row execute function public.check_tournament_game_winner();

revoke execute on function public.check_tournament_game_winner()
  from public;
grant execute on function public.check_tournament_game_winner()
  to anon, authenticated, service_role;

-- Opretter turneringen, dens deltagere og dens kampplan/bracket i ét
-- atomisk kald. Kampplanen er stadig udregnet i klienten (round robin-
-- parring og bracket-generering med byes er rene, testede TS-funktioner,
-- se roundRobin.ts/bracket.ts) -- RPC'en indsætter blot det færdige
-- resultat, med sine egne client-genererede id'er, så next_match_id kan
-- pege direkte på en kamp, der indsættes i samme kald.
create function public.create_tournament_with_matches(
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
     participant2_id, winner_id, status, next_match_id, next_match_slot)
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
    (m->>'next_match_slot')::smallint
  from jsonb_array_elements(p_matches) as m;

  return v_tournament_id;
end;
$$;

revoke execute on function public.create_tournament_with_matches(
  text, jsonb, jsonb
) from public;
grant execute on function public.create_tournament_with_matches(
  text, jsonb, jsonb
) to authenticated;

-- Tager imod enkeltspilsresultaterne for én kamp (i rækkefølge: spil 1,
-- spil 2, evt. spil 3), udregner kampvinderen (først til 2), gemmer
-- resultatet, rykker vinderen videre til næste bracket-kamp, og markerer
-- turneringen afsluttet, når den er det -- alt i ét kald.
create function public.record_tournament_match_result(
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

  if v_next_match_id is not null then
    if v_next_match_slot = 1 then
      update public.tournament_matches
      set participant1_id = v_winner_id
      where id = v_next_match_id;
    else
      update public.tournament_matches
      set participant2_id = v_winner_id
      where id = v_next_match_id;
    end if;
  end if;

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

revoke execute on function public.record_tournament_match_result(
  uuid, uuid[]
) from public;
grant execute on function public.record_tournament_match_result(
  uuid, uuid[]
) to authenticated;

-- Fortryder en afgjort kamp: sletter dens enkeltspil og sætter den tilbage
-- til 'pending'. Kun tilladt, når det er trygt at gøre -- ikke en bye (der
-- ikke er noget resultat at fortryde for), og kun hvis den kamp, vinderen
-- eventuelt allerede er rykket videre til, ikke selv er afgjort endnu (så
-- man ikke trækker tæppet væk under et resultat, der bygger ovenpå).
create function public.undo_tournament_match_result(p_match_id uuid)
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

  if v_next_match_id is not null then
    select status into v_next_match_status
    from public.tournament_matches
    where id = v_next_match_id;

    if v_next_match_status = 'completed' then
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
  end if;

  delete from public.tournament_games where match_id = p_match_id;

  update public.tournament_matches
  set status = 'pending', winner_id = null
  where id = p_match_id;

  update public.tournaments
  set status = 'in_progress'
  where id = v_tournament_id and status = 'completed';
end;
$$;

revoke execute on function public.undo_tournament_match_result(uuid)
  from public;
grant execute on function public.undo_tournament_match_result(uuid)
  to authenticated;

notify pgrst, 'reload schema';
