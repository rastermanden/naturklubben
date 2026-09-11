-- Eksplicitte rettigheder til API-rollerne (#209).
--
-- Indtil nu har migrationskæden kun skrevet `grant`, hvor den bevidst snævrede
-- ind (profiles efter #96, feature_announcements, events for anon ...). Alt
-- andet -- select på profiles, activities og member_badges, service_roles
-- adgang til push_vapid_keys, usage på identity-sekvenserne -- kom fra
-- Supabases *default privileges*, som gav anon, authenticated og service_role
-- alt på nye tabeller, sekvenser og funktioner i public.
--
-- Nye Supabase-projekter har ikke længere de standarder: tabeller og sekvenser
-- oprettes lukkede for API-rollerne (funktioner beholder PostgreSQL's egen
-- execute-til-public, medmindre en migration trækker den tilbage). En Preview
-- Branch er et nyt projekt, og på #208 svarede derfor stort set alle kald
-- 401/403, mens produktionen (et gammelt projekt) var upåvirket. Det samme
-- ville ramme en gendannelse eller et nyt miljø.
--
-- Denne migration gør skemaet selvforsynende: den skriver de rettigheder,
-- produktionen faktisk har i dag, som eksplicitte grants. Listen er genereret
-- fra produktionens kataloger (role_table_grants, column_privileges,
-- role_usage_grants og has_function_privilege) -- ikke fra en vurdering af,
-- hvad appen burde have. Det er med vilje: migrationen skal være et rent
-- no-op i produktion og ændre nul adfærd. Rettighederne er bredere, end appen
-- har brug for (fx delete på profiles for anon); RLS og funktionernes egne
-- tjek er det, der holder i dag, og at stramme listen er et selvstændigt
-- arbejde med sin egen pgTAP-dækning, se #209.
--
-- Fremadrettet skriver hver ny migration sine egne grants -- CI's
-- platformsbootstrap kører nu med de nye, stramme standarder, så en glemt
-- grant fejler dér.

-- ---------------------------------------------------------------------------
-- Tabeller og views
-- ---------------------------------------------------------------------------
grant delete, insert, select, update on table public.activities to anon, authenticated, service_role;
grant delete, insert, select, update on table public.admin_role_changes to service_role;
grant select on table public.admin_role_changes to authenticated;
grant delete, insert, select, update on table public.allowed_emails to service_role;
grant delete, select on table public.allowed_emails to anon, authenticated;
grant delete, insert, select, update on table public.badge_nomination_approvals to service_role;
grant select on table public.badge_nomination_approvals to anon, authenticated;
grant delete, insert, select, update on table public.badge_nominations to service_role;
grant select on table public.badge_nominations to anon, authenticated;
grant delete, insert, select, update on table public.badge_productions to service_role;
grant select on table public.badge_productions to anon, authenticated;
grant delete, insert, select, update on table public.badges to service_role;
grant delete, insert, select on table public.badges to anon, authenticated;
grant delete, insert, select, update on table public.calendar_feed_events to service_role;
grant select on table public.calendar_feed_events to anon;
grant delete, insert, select, update on table public.event_attendance to anon, authenticated, service_role;
grant delete, insert, select, update on table public.event_tasks to anon, service_role;
grant delete, insert, select on table public.event_tasks to authenticated;
grant delete, insert, select, update on table public.events to anon, authenticated, service_role;
grant delete, insert, select, update on table public.feature_announcement_push_deliveries to service_role;
grant delete, insert, select, update on table public.feature_announcement_reads to service_role;
grant delete, insert, select on table public.feature_announcement_reads to anon, authenticated;
grant delete, insert, select, update on table public.feature_announcements to service_role;
grant delete, insert, select, update on table public.gallery_event_photo_counts to service_role;
grant select on table public.gallery_event_photo_counts to authenticated;
grant delete, insert, select, update on table public.game_scores to anon, service_role;
grant delete, insert, select on table public.game_scores to authenticated;
grant delete, insert, select, update on table public.member_badges to service_role;
grant select on table public.member_badges to anon, authenticated;
grant delete, insert, select, update on table public.message_reactions to anon, authenticated, service_role;
grant delete, insert, select, update on table public.messages to service_role;
grant insert, select on table public.messages to anon, authenticated;
grant delete, insert, select, update on table public.observations to anon, service_role;
grant delete, insert, select on table public.observations to authenticated;
grant delete, insert, select, update on table public.photo_moderation_log to service_role;
grant select on table public.photo_moderation_log to authenticated;
grant delete, insert, select, update on table public.photos to anon, service_role;
grant select on table public.photos to authenticated;
grant delete, insert, select, update on table public.probation_application_push_subscriptions to service_role;
grant delete, insert, select, update on table public.probation_applications to service_role;
grant delete, select, update on table public.probation_applications to anon, authenticated;
grant delete, insert, select, update on table public.profiles to anon, service_role;
grant delete, insert, select on table public.profiles to authenticated;
grant delete, insert, select, update on table public.push_subscriptions to anon, authenticated, service_role;
grant delete, insert, select, update on table public.push_vapid_keys to service_role;

-- Kolonnegrants, som tidligere migrationer allerede skriver eksplicit, gentages
-- ikke her: de er i kæden og har aldrig afhængt af standarderne.

-- ---------------------------------------------------------------------------
-- Sekvenser bag identity-kolonner (insert kræver usage)
-- ---------------------------------------------------------------------------
grant usage, select, update on sequence public.admin_role_changes_id_seq to anon, authenticated, service_role;
grant usage, select, update on sequence public.photo_moderation_log_id_seq to anon, authenticated, service_role;
grant usage, select, update on sequence public.probation_applications_id_seq to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Funktioner: RPC'er, politikkernes hjælpere og triggerfunktioner
-- ---------------------------------------------------------------------------
-- De fleste er allerede executable via public. Listen gentages alligevel, som
-- produktionen har den, så skemaet ikke afhænger af, hvad en fremtidig
-- platformsstandard gør ved public-execute.
grant execute on function public.account_accepts_writes() to anon, authenticated, service_role;
grant execute on function public.approve_probation_application(bigint) to anon, authenticated, service_role;
grant execute on function public.check_allowed_email() to anon, authenticated, service_role;
grant execute on function public.claim_badge_print(uuid, uuid) to service_role;
grant execute on function public.claim_badge_production(uuid) to authenticated, service_role;
grant execute on function public.claim_feature_announcement_push(uuid) to service_role;
grant execute on function public.claim_photo_deletion(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.claim_photo_optimization(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.claim_probation_notification(bigint, text) to anon, authenticated, service_role;
grant execute on function public.cleanup_email_records_on_user_delete() to anon, authenticated, service_role;
grant execute on function public.complete_badge_print(uuid, integer, boolean, text, text) to service_role;
grant execute on function public.complete_badge_production(uuid) to authenticated, service_role;
grant execute on function public.complete_feature_announcement_push(uuid, integer, boolean, text) to service_role;
grant execute on function public.complete_photo_optimization(uuid, integer, boolean, text, text, text) to anon, authenticated, service_role;
grant execute on function public.complete_probation_notification(bigint, text, integer, boolean, text) to anon, authenticated, service_role;
grant execute on function public.delete_claimed_photo(uuid, integer) to anon, authenticated, service_role;
grant execute on function public.enqueue_probation_notification(text, bigint, text, uuid) to anon, authenticated, service_role;
grant execute on function public.fail_photo_deletion(uuid, integer, text) to anon, authenticated, service_role;
grant execute on function public.get_chat_message_context(uuid, integer) to authenticated, service_role;
grant execute on function public.handle_new_user() to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.nominate_member_for_badge(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.pending_feature_announcement_pushes() to service_role;
grant execute on function public.prevent_awarded_badge_delete() to anon, authenticated, service_role;
grant execute on function public.prevent_photo_write_during_account_deletion() to anon, authenticated, service_role;
grant execute on function public.prevent_probation_application_for_allowed_email() to anon, authenticated, service_role;
grant execute on function public.probation_notification_function_url() to anon, authenticated, service_role;
grant execute on function public.protect_admin_invariant_during_deletion() to anon, authenticated, service_role;
grant execute on function public.purge_expired_probation_applications() to anon, authenticated, service_role;
grant execute on function public.reject_probation_application(bigint) to anon, authenticated, service_role;
grant execute on function public.reserve_account_deletion(uuid) to anon, authenticated, service_role;
grant execute on function public.reset_badge_print_on_change() to anon, authenticated, service_role;
grant execute on function public.retry_probation_notifications() to anon, authenticated, service_role;
grant execute on function public.search_chat_messages(text, timestamptz, uuid, integer) to authenticated, service_role;
grant execute on function public.set_admin_role(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_observation_updated_at() to anon, authenticated, service_role;
grant execute on function public.soft_delete_message(uuid) to authenticated, service_role;
grant execute on function public.submit_probation_application_limited(text, citext, text, text, text, text, text, text, text) to service_role;
grant execute on function public.touch_badge_updated_at() to anon, authenticated, service_role;
grant execute on function public.touch_push_subscription_updated_at() to anon, authenticated, service_role;
grant execute on function public.upsert_photo_upload(uuid, text, text, uuid) to anon, authenticated, service_role;
grant execute on function public.vote_on_badge_nomination(uuid, text, text) to authenticated, service_role;

-- Extensions installeret i public (citext, pgcrypto): deres funktioner ligger
-- bag operatorerne på allowed_emails.email og probation_applications.email,
-- og en sammenligning kræver execute på operatorens funktion. I produktion
-- fik de execute af standarderne; her gives den eksplicit til alt, der hører
-- til en extension i public, så listen ikke skal vedligeholdes i hånden.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    join pg_depend as d on d.objid = p.oid and d.classid = 'pg_proc'::regclass
    join pg_extension as e on e.oid = d.refobjid and d.refclassid = 'pg_extension'::regclass
    where n.nspname = 'public'
      and d.deptype = 'e'
  loop
    execute format(
      'grant execute on function %s to anon, authenticated, service_role', fn
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';
