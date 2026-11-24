-- Testovi za podrazumevane kategorije troškova, koeficijente u procentima i evropske praznike
-- (migracija 20261124130000_podrazumevani_sifarnici.sql). Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, instance_id, aud, role) values
  ('13111111-1111-4111-8111-111111111111', 'qa13-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('13222222-2222-4222-8222-222222222222', 'qa13-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '13111111-1111-4111-8111-111111111111';
update public.profiles set role = 'operater', active = true where id = '13222222-2222-4222-8222-222222222222';

-- ───── spisak sa slika 8 i 9 ─────
select is(jsonb_array_length(public.default_cost_categories()), 12, '12 podrazumevanih kategorija');
select is((select sum(jsonb_array_length(c -> 'subcategories'))::int from jsonb_array_elements(public.default_cost_categories()) c),
          86, '86 podrazumevanih podkategorija');
select ok(public.default_cost_categories() @> '[{"name":"Site Facilities & Services","subcategories":[{"name":"Site Maintenance"}]}]'
      and public.default_cost_categories() @> '[{"name":"Insurance & Compliance","subcategories":[{"name":"Regulatory Fees & Licenses"}]}]',
          'nazivi bez artefakta „Kopiraj kategorije"');

-- Posle seed-a postoji svaka podrazumevana kategorija; ponovni seed ne pravi duplikate.
select public.seed_default_cost_categories(true);
select is((select count(*)::int from jsonb_array_elements(public.default_cost_categories()) d
           where not exists (select 1 from public.cost_categories cc
                             where public.cost_category_key(cc.name) = public.cost_category_key(d ->> 'name'))),
          0, 'sve podrazumevane kategorije postoje');
select is(public.seed_default_cost_categories(true), 0, 'ponovni seed ne ubacuje ništa');
select is((select count(*)::int from public.cost_categories where public.cost_category_key(name) = 'accommodation'),
          1, 'nema duplikata po nazivu');

-- Ručno uneta kategorija (drugačija velika slova/razmak, deo podkategorija, stari string zapis) se dopunjuje, ne duplira.
delete from public.cost_categories where public.cost_category_key(name) = 'transport & logistics';
insert into public.cost_categories (name, translation, subcategories)
  values ('transport & LOGISTICS ', 'Transport', '[{"name":"fuel","translation":"Gorivo"},"Tolls"]');
select is(public.seed_default_cost_categories(true), 0, 'postojeća kategorija istog naziva se ne ubacuje ponovo');
select is((select subcategories from public.cost_categories where public.cost_category_key(name) = 'transport & logistics'),
          '[{"name":"fuel","translation":"Gorivo"},"Tolls",{"name":"Travel Expenses"},{"name":"Flight Tickets"},{"name":"Car Rental"}]'::jsonb,
          'dopunjene su samo podkategorije koje fale; postojeće (i prevod u bazi) ostaju');

-- ───── brisanje i „Restore default categories" ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"13111111-1111-4111-8111-111111111111","role":"authenticated"}';
delete from public.cost_categories where public.cost_category_key(name) in ('accommodation', 'training costs');
select is((select count(*)::int from public.cost_categories where public.cost_category_key(name) in ('accommodation', 'training costs')),
          0, 'admin briše podrazumevane kategorije');
update public.cost_categories set subcategories = '[{"name":"Fuel"}]' where public.cost_category_key(name) = 'transport & logistics';
select is(public.restore_default_cost_categories(), 2, 'vraćanje ubacuje samo obrisane podrazumevane');
select is((select jsonb_array_length(subcategories) from public.cost_categories where name = 'Accommodation'), 9,
          'vraćena kategorija ima svoje podkategorije');
select is((select subcategories from public.cost_categories where public.cost_category_key(name) = 'transport & logistics'),
          '[{"name":"Fuel"}]'::jsonb, 'vraćanje ne dira postojeću kategoriju (namerno obrisane podkategorije ostaju obrisane)');
select is(public.restore_default_cost_categories(), 0, 'ponovno vraćanje ne pravi duplikate');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"13222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$select public.restore_default_cost_categories()$$, '42501', null, 'operater ne vraća kategorije');
select throws_ok($$select public.seed_default_cost_categories(true)$$, '42501', null, 'interni seed nije dostupan prijavljenima');
reset role;
set local role anon;
select throws_ok($$select public.restore_default_cost_categories()$$, '42501', null, 'anon ne vraća kategorije');
reset role;

-- ───── koeficijenti: 0 < k ≤ 10 ─────
select throws_ok($$update public.hour_types set client_coef = 10.5 where code = 'vikend'$$, '23514', null, 'koeficijent preko 10 (1000%) je odbijen');
select lives_ok($$update public.hour_types set worker_coef = 10, client_coef = 1.505 where code = 'vikend'$$, 'koeficijent 10 i 1,505 (150,5%) prolaze');

-- ───── praznici ─────
select is((select count(*)::int from public.holidays where date in (
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25', '2026-12-25', '2026-12-26',
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-01', '2027-05-06', '2027-05-17', '2027-12-25', '2027-12-26')),
  16, 'osnovni evropski praznici 2026. i 2027. postoje');
select is((select count(*)::int from public.holidays where date in ('2026-04-05', '2027-03-28')), 0,
          'uskrsna nedelja nije na listi (samo petak i ponedeljak)');

select * from finish();
rollback;
