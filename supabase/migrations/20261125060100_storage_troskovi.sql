-- Phase 7 / T-D dopuna — prilozi troškova u storage-u (bucket `files`).
-- Do sada je račun troška (`project_costs.receipt_url`) mogao da otvori svako osoblje, npr. HR bez prava na troškove.
-- Sada: fajl vezan za trošak čita samo ko ima costs.view i vidi projekat troška; menja/briše ko ima costs.manage.
-- Pravila za dokumente (T19) ostaju; fajl koji nije vezan ni za dokument ni za trošak ostaje dostupan osoblju (R11).
-- Upload pre čuvanja troška nije pogođen (fajl još nije vezan za red). Idempotentno; ništa anon-u (D14).

create index if not exists project_costs_receipt_url_idx on public.project_costs (receipt_url) where receipt_url is not null;

create or replace function public.can_read_storage_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff()
     -- osetljiv dokument (vrsta osetljiva ili restricted) traži documents.view_sensitive
     and (not exists (select 1 from public.documents d left join public.document_types t on t.code = d.category
                       where d.file_url = 'storage://files/' || p_name and (coalesce(t.sensitive, true) or d.restricted))
          or public.has_permission('documents.view_sensitive'))
     -- račun troška traži costs.view i vidljiv projekat (svaki trošak koji koristi fajl)
     and not exists (select 1 from public.project_costs c
                      where c.receipt_url = 'storage://files/' || p_name
                        and not (public.has_permission('costs.view') and public.can_see_project(c.project_id)))
$$;
revoke execute on function public.can_read_storage_object(text) from public, anon;
grant execute on function public.can_read_storage_object(text) to authenticated;

create or replace function public.can_modify_storage_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_storage_object(p_name)
     and (not exists (select 1 from public.documents d where d.file_url = 'storage://files/' || p_name)
          or public.has_permission('documents.manage'))
     and (not exists (select 1 from public.project_costs c where c.receipt_url = 'storage://files/' || p_name)
          or public.has_permission('costs.manage'))
$$;
revoke execute on function public.can_modify_storage_object(text) from public, anon;
grant execute on function public.can_modify_storage_object(text) to authenticated;
