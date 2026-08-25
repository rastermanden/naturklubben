-- Adminrollen: kun set_admin_role() må flytte den, og kun for en admin (#96).
begin;

set local search_path = public, tests;

select plan(14);

do $$
begin
  perform tests.create_member(
    'alice@example.com', false, '00000000-0000-0000-0000-00000000000a'
  );
  perform tests.create_member(
    'bob@example.com', false, '00000000-0000-0000-0000-00000000000b'
  );
  perform tests.create_member(
    'admin@example.com', true, '00000000-0000-0000-0000-0000000000ad'
  );

  -- Migrationerne forfremmer klubbens ejer, hvis brugeren findes. Testen skal
  -- kunne regne med præcis én admin, så ejeren oprettes ikke her.
  perform tests.logout();
end
$$;

select throws_ok(
  $$select public.set_admin_role(
      '00000000-0000-0000-0000-00000000000b', true
    )$$,
  '42501',
  null,
  'anonyme kan ikke kalde set_admin_role'
);

-- Alice, et almindeligt medlem
do $$ begin perform tests.login('00000000-0000-0000-0000-00000000000a'); end $$;

select throws_ok(
  $$update public.profiles set is_admin = true
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501',
  null,
  'et medlem kan ikke sætte is_admin direkte på sin egen profil'
);

select throws_ok(
  $$select public.set_admin_role(
      '00000000-0000-0000-0000-00000000000a', true
    )$$,
  '42501',
  'admin_role_not_authorized',
  'et medlem kan ikke forfremme sig selv'
);

select throws_ok(
  $$select public.set_admin_role(
      '00000000-0000-0000-0000-00000000000b', true
    )$$,
  '42501',
  'admin_role_not_authorized',
  'et medlem kan ikke forfremme andre'
);

select is(
  (select count(*)::int from public.admin_role_changes),
  0,
  'et medlem kan ikke læse revisionssporet'
);

select throws_ok(
  $$insert into public.admin_role_changes (
      actor_id, actor_name, target_id, target_name, old_is_admin, new_is_admin
    ) values (
      '00000000-0000-0000-0000-00000000000a', 'Alice',
      '00000000-0000-0000-0000-00000000000a', 'Alice', false, true
    )$$,
  '42501',
  null,
  'ingen klientrolle kan skrive i revisionssporet'
);

-- Admin
do $$ begin perform tests.login('00000000-0000-0000-0000-0000000000ad'); end $$;

select lives_ok(
  $$select public.set_admin_role(
      '00000000-0000-0000-0000-00000000000b', true
    )$$,
  'en admin kan forfremme et medlem'
);

select is(
  (
    select is_admin
    from public.profiles
    where id = '00000000-0000-0000-0000-00000000000b'
  ),
  true,
  'forfremmelsen slår igennem på profilen'
);

select is(
  (select is_admin from public.allowed_emails where email = 'bob@example.com'),
  true,
  'forfremmelsen følger med på allowlisten, så flaget overlever en ny signup'
);

select results_eq(
  $$select actor_id, target_id, old_is_admin, new_is_admin
    from public.admin_role_changes
    where target_id = '00000000-0000-0000-0000-00000000000b'$$,
  $$values (
      '00000000-0000-0000-0000-0000000000ad'::uuid,
      '00000000-0000-0000-0000-00000000000b'::uuid,
      false,
      true
    )$$,
  'ændringen er noteret i revisionssporet'
);

select throws_ok(
  $$select public.set_admin_role(
      '00000000-0000-0000-0000-00000000000b', true
    )$$,
  '22023',
  'admin_role_unchanged',
  'en rolle, der allerede er sat, afvises frem for at give en tom revisionsrække'
);

select throws_ok(
  $$select public.set_admin_role(
      '00000000-0000-0000-0000-0000000000ff', true
    )$$,
  'P0002',
  'admin_role_target_not_found',
  'et ukendt medlem afvises'
);

select lives_ok(
  $$select public.set_admin_role(
      '00000000-0000-0000-0000-00000000000b', false
    )$$,
  'en admin kan degradere et medlem igen'
);

select throws_ok(
  $$select public.set_admin_role(
      '00000000-0000-0000-0000-0000000000ad', false
    )$$,
  '23514',
  'admin_role_last_admin',
  'den sidste admin kan ikke degradere sig selv'
);

do $$ begin perform tests.reset_session(); end $$;

select * from finish(true);

rollback;
