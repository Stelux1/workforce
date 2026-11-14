-- SAMO ZA LOKALNI RAZVOJ (npx supabase db reset). Ne pokreće se na produkciji.
-- Lokalni admin nalog za prijavu u aplikaciju na http://localhost:5173
--   email:   admin@radnici.local
--   lozinka: 8nfWTuzq4ZeIhyHpMtZs
-- Prvi korisnik u bazi automatski postaje admin (handle_new_user).

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

-- Lokalni operater (bez pristupa novcu)
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
