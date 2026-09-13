-- Turnering: record_tournament_match_result skal sige fra over for kampe,
-- der ikke kan afgøres.
--
-- Funktionen tjekkede kun, at enkeltspillene udpegede en vinder af mindst 2
-- spil. Alt andet gik igennem, og det efterlod to huller:
--
-- 1. En kamp, hvor kun den ene plads er udfyldt, kunne afgøres -- vinderen
--    "vandt" over en tom plads. Det kan ske i praksis: to arrangører taster
--    ind fra hver sin telefon, og den ene fortryder den fødekamp, den anden
--    lige har åbnet kampkortet for. Klienten viser kun kampe med to
--    deltagere (SingleEliminationDetail), men det er kun klienten.
-- 2. Blev den samme kamp tastet ind to gange, fejlede den anden indtastning
--    på unique-nøglen (match_id, game_number) i tournament_games. Det
--    beskytter data -- men brugeren fik "Resultatet kunne ikke gemmes. Prøv
--    igen", og den opfordring kan aldrig lykkes.
--
-- Rækkefølgen af tjekkene er bevidst: vinderen af 2 spil udregnes først, for
-- det handler om selve argumentet, ikke om kampens tilstand. Derefter
-- kommer tilstandstjekkene, så en dobbelt-indtastning med et gyldigt
-- resultat får den rigtige besked.

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

  select status, participant1_id, participant2_id, bye
  into v_status, v_participant1_id, v_participant2_id, v_bye
  from public.tournament_matches
  where id = p_match_id;

  if not found then
    raise exception 'Ukendt kamp' using errcode = 'P0002';
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

notify pgrst, 'reload schema';
