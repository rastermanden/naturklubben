-- Trykfilen må ikke kunne hænge fast i 'rendering'.
--
-- claim_badge_print sætter statussen til 'rendering' og frigiver den først
-- igen, når render-badge-print melder tilbage. Dør functionen undervejs -- den
-- oprindelige rendering byggede sit canvas i originalens opløsning og kunne
-- løbe tør for hukommelse i Edge-runtimen -- kommer der aldrig et
-- complete_badge_print. Så står badgen som "Trykfilen laves…", og et nyt
-- forsøg blev afvist, indtil claim'et var 10 minutter gammelt.
--
-- 10 minutter er langt mere, end en Edge Function overhovedet kan køre: en
-- rendering, der stadig lever efter to minutter, kommer ikke i mål. Derfor
-- sænkes vinduet til to minutter, så admin kan trykke "Lav trykfilen" igen med
-- det samme frem for at vente et kvarter på en rendering, der er død.
--
-- Det er stadig sikkert at overhale en rendering, der lever endnu:
-- complete_badge_print kræver, at print_attempts matcher dét forsøg, den
-- selv claimede, så den overhalede rendering får `false` tilbage og rydder sin
-- egen fil op i stedet for at overskrive den nye.
create or replace function public.claim_badge_print(
  p_badge_id uuid,
  p_user_id uuid
)
returns table (
  claimed_image_path text,
  claimed_attempt integer,
  claimed_crop_x double precision,
  claimed_crop_y double precision,
  claimed_crop_size double precision,
  claimed_diameter_mm numeric,
  claimed_bleed_mm numeric
)
language sql
security definer
set search_path = public
as $$
  update public.badges
  set print_status = 'rendering',
      print_attempts = print_attempts + 1,
      print_started_at = now(),
      print_completed_at = null,
      print_error = null
  where id = p_badge_id
    and coalesce(
      (select p.is_admin from public.profiles as p where p.id = p_user_id),
      false
    )
    and (
      print_status in ('pending', 'failed', 'ready')
      or (
        print_status = 'rendering'
        and (
          print_started_at is null
          or print_started_at <= now() - interval '2 minutes'
        )
      )
    )
  returning
    image_path,
    print_attempts,
    crop_x,
    crop_y,
    crop_size,
    diameter_mm,
    bleed_mm
$$;

-- create or replace bevarer ikke grants fra den oprindelige migration, hvis
-- signaturen ændrer sig -- den gør den ikke her, men sæt dem alligevel, så
-- filen kan læses alene.
revoke all on function public.claim_badge_print(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_badge_print(uuid, uuid) to service_role;
