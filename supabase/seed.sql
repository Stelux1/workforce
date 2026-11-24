-- SAMO ZA LOKALNI RAZVOJ (npx supabase db reset). Ne pokreće se na produkciji.
-- Lokalni admin nalog za prijavu u aplikaciju na http://localhost:5173
--   email:   admin@radnici.local
--   lozinka: 8nfWTuzq4ZeIhyHpMtZs
-- Prvi korisnik u bazi automatski postaje aktivan admin (handle_new_user); ostali su neaktivni dok ih admin ne aktivira.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'admin@radnici.local',
  extensions.crypt('8nfWTuzq4ZeIhyHpMtZs', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Lokalni admin"}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
  jsonb_build_object('sub', 'a0000000-0000-4000-8000-000000000001', 'email', 'admin@radnici.local', 'email_verified', true),
  'email', now(), now(), now()
);

-- Lokalni operater — posle migracije 20261125010000 uloga HR (bez pristupa novcu)
--   email:   operater@radnici.local
--   lozinka: 8GImVqO1Auzxu0QZtHTZ
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'operater@radnici.local',
  extensions.crypt('8GImVqO1Auzxu0QZtHTZ', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Lokalni operater"}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
  jsonb_build_object('sub', 'a0000000-0000-4000-8000-000000000002', 'email', 'operater@radnici.local', 'email_verified', true),
  'email', now(), now(), now()
);


-- Lokalni Project Manager (projekti, dodele, satnice i B2B; bez troška rada i obračuna)
--   email:   pm@radnici.local
--   lozinka: waV7KOS2ZQdHEMaLO0Fs
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003',
  'authenticated', 'authenticated', 'pm@radnici.local',
  extensions.crypt('waV7KOS2ZQdHEMaLO0Fs', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Lokalni Project Manager"}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003',
  jsonb_build_object('sub', 'a0000000-0000-4000-8000-000000000003', 'email', 'pm@radnici.local', 'email_verified', true),
  'email', now(), now(), now()
);

-- Lokalni HR (radnici, lični podaci, dokumenta, projekti i dodele; bez novca)
--   email:   hr@radnici.local
--   lozinka: 3D5jBxhLK9HOINUtoCuh
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000004',
  'authenticated', 'authenticated', 'hr@radnici.local',
  extensions.crypt('3D5jBxhLK9HOINUtoCuh', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Lokalni HR"}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), 'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004',
  jsonb_build_object('sub', 'a0000000-0000-4000-8000-000000000004', 'email', 'hr@radnici.local', 'email_verified', true),
  'email', now(), now(), now()
);

-- Lokalni Finance (tarife, odobravanje i korekcija satnica, obračun, troškovi, billing)
--   email:   finance@radnici.local
--   lozinka: UyL5dh1MHvD1g4BIEHcA
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000005',
  'authenticated', 'authenticated', 'finance@radnici.local',
  extensions.crypt('UyL5dh1MHvD1g4BIEHcA', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Lokalni Finance"}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), 'a0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005',
  jsonb_build_object('sub', 'a0000000-0000-4000-8000-000000000005', 'email', 'finance@radnici.local', 'email_verified', true),
  'email', now(), now(), now()
);

-- Nov nalog je neaktivan dok ga admin ne aktivira (handle_new_user, migracije 20261114250000 i 20261125010000);
-- prvi nalog (admin) je aktivan sam. Lokalni nalozi se aktiviraju ovde, kao što bi ih admin aktivirao, i dobijaju ulogu.
update public.profiles set active = true where id = 'a0000000-0000-4000-8000-000000000002';
update public.profiles set active = true, role = 'project_manager' where id = 'a0000000-0000-4000-8000-000000000003';
update public.profiles set active = true, role = 'hr' where id = 'a0000000-0000-4000-8000-000000000004';
update public.profiles set active = true, role = 'finance' where id = 'a0000000-0000-4000-8000-000000000005';
