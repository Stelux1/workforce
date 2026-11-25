import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { requireSupabase } from "@/api/supabase";
import { dataError } from "@/api/errors";
import { AlertTriangle, Info, KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import CreateUserDialog from "@/components/users/CreateUserDialog";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import PageHeader from "@/components/shared/PageHeader";
import { PermissionDenied } from "@/components/ProtectedRoute";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";
import { formatDate, longDatePattern } from "@/lib/dateFormat";
import { PERMISSIONS, roleLabel } from "@/lib/permissions";
import PermissionMatrix from "@/components/users/PermissionMatrix";
import { Input } from "@/components/ui/input";
import {
  ROLES, isLastActiveAdmin, needsSelfConfirm, roleDefaultsFrom, userPermissions,
} from "@/lib/userAccounts";

// Podešavanja → „Korisnici" (users.manage; podrazumevano samo admin). Aktivacija, uloga (Admin, Project Manager, HR,
// Finance), opseg projekata i pojedinačna prava (override). Baza sprovodi sva pravila (migracije 20261125010000 i
// 20261125020000): ulogu admin daje samo admin, override nad adminom se odbija, poslednji aktivan admin ostaje.
// Nov nalog otvara samo admin (dugme „Novi korisnik“ → admin_create_user, D31); lozinke se posle ne menjaju ovde.

const sb = () => requireSupabase();
const run = async (promise, context) => {
  const { data, error } = await promise;
  if (error) throw dataError(error, context);
  return data;
};

export default function UsersSettings() {
  const L = useL();
  const { lang } = useLang();
  const { user, checkAppState, can, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(null); // { profile, patch } — admin sebi oduzima pristup
  const [editing, setEditing] = useState(null); // profil za dijalog prava i projekata
  const [creating, setCreating] = useState(false); // dijalog „Novi korisnik“ (samo admin)

  const allowed = can(PERMISSIONS.USERS_MANAGE);

  const profilesQ = useQuery({
    queryKey: ["profiles"],
    queryFn: () => base44.entities.Profile.list("created_date"),
    enabled: allowed,
  });
  const rolePermsQ = useQuery({
    queryKey: ["role_permissions"],
    queryFn: () => run(sb().from("role_permissions").select("role, permission"), "RolePermission.list"),
    enabled: allowed,
  });
  const overridesQ = useQuery({
    queryKey: ["user_permission_overrides"],
    queryFn: () => run(sb().from("user_permission_overrides").select("user_id, permission, granted"), "UserPermissionOverride.list"),
    enabled: allowed,
  });
  const accessQ = useQuery({
    queryKey: ["user_project_access"],
    queryFn: () => run(sb().from("user_project_access").select("user_id, project_id"), "UserProjectAccess.list"),
    enabled: allowed,
  });
  const projectsQ = useQuery({
    queryKey: ["projects", "users-settings"],
    queryFn: () => base44.entities.Project.list("name"),
    enabled: allowed,
  });

  const profiles = profilesQ.data || [];
  const roleDefaults = useMemo(() => roleDefaultsFrom(rolePermsQ.data || []), [rolePermsQ.data]);
  const overrides = overridesQ.data || [];
  const access = accessQ.data || [];
  const projects = projectsQ.data || [];
  const rl = (role) => roleLabel(role, lang);

  const refreshAll = () => {
    for (const key of ["profiles", "user_permission_overrides", "user_project_access"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const change = useMutation({
    mutationFn: ({ profile, patch }) => base44.entities.Profile.update(profile.id, patch),
    onSuccess: (_row, { profile, patch }) => {
      const who = profile.full_name || profile.email;
      if ("active" in patch) {
        toast.success(patch.active ? L(`Account activated: ${who}`, `Nalog je aktiviran: ${who}`, `Účet bol aktivovaný: ${who}`) : L(`Account deactivated: ${who}`, `Nalog je deaktiviran: ${who}`, `Účet bol deaktivovaný: ${who}`));
      } else if ("role" in patch) {
        toast.success(L(`Role changed to ${rl(patch.role)}: ${who}`, `Uloga je promenjena u ${rl(patch.role)}: ${who}`, `Rola bola zmenená na ${rl(patch.role)}: ${who}`));
      } else {
        toast.success(L(`Project access changed: ${who}`, `Pristup projektima je promenjen: ${who}`, `Prístup k projektom bol zmenený: ${who}`));
      }
      // Promena sopstvenog naloga: ponovo učitaj profil i prava.
      if (profile.id === user?.id) checkAppState();
    },
    onError: (e) => toast.error(e.message),
    // I posle odbijene izmene (npr. poslednji aktivan admin) prikaz se vraća na stanje iz baze.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const request = (profile, patch) => {
    if (needsSelfConfirm(profiles, profile, patch, user?.id)) setConfirm({ profile, patch });
    else change.mutate({ profile, patch });
  };

  const busy = (id) => change.isPending && change.variables?.profile?.id === id;
  const fmtCreated = (d) => (d ? formatDate(new Date(d), longDatePattern(lang), lang) : "—");
  const overrideCount = (id) => overrides.filter((o) => o.user_id === id).length;
  const projectCount = (id) => access.filter((a) => a.user_id === id).length;

  if (!allowed) return <PermissionDenied />;

  const loadError = [profilesQ, rolePermsQ, overridesQ, accessQ].find((q) => q.error)?.error;
  const loading = [profilesQ, rolePermsQ, overridesQ, accessQ].some((q) => q.isLoading);

  return (
    <div className="space-y-6">
      <PageHeader
        title={L("Users", "Korisnici", "Používatelia")}
        subtitle={L(
          "Accounts that can sign in: activation, role, project access and individual permissions",
          "Nalozi koji mogu da se prijave: aktivacija, uloga, pristup projektima i pojedinačna prava", "Účty, ktoré sa môžu prihlásiť: aktivácia, rola, prístup k projektom a jednotlivé oprávnenia"
        )}
      >
        {isAdmin && (
          <Button onClick={() => setCreating(true)} className="gap-1.5" data-testid="new-user">
            <UserPlus className="w-4 h-4" />
            {L("New user", "Novi korisnik", "Nový používateľ")}
          </Button>
        )}
      </PageHeader>

      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm" data-testid="users-note">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p>
            {L(
              "Only an admin creates new users (“New user”): email, initial password, role, projects and the sections the person sees. The account is active right away. Under “Permissions” you can later hide sections or change individual actions.",
              "Nove korisnike pravi samo admin („Novi korisnik“): email, početna lozinka, uloga, projekti i sekcije koje osoba vidi. Nalog je odmah aktivan. Pod „Prava“ kasnije možete da sakrijete sekcije ili promenite pojedinačne radnje.", "Nových používateľov vytvára iba admin („Nový používateľ“): e-mail, počiatočné heslo, rola, projekty a sekcie, ktoré osoba vidí. Účet je hneď aktívny. V časti „Oprávnenia“ môžete neskôr skryť sekcie alebo zmeniť jednotlivé akcie."
            )}
          </p>
          <p>
            {L(
              "Admin: everything. Project Manager: projects, assignments, hours and B2B rates on their projects. HR: employees, personal data, documents, projects and hours, without money. Finance: rates, approvals, payroll, costs and billing. At least one active admin must remain.",
              "Admin: sve. Projekt menadžer: projekti, angažmani, sati i B2B tarife na svojim projektima. HR: radnici, lični podaci, dokumenta, projekti i sati, bez novca. Finansije: tarife, odobravanja, obračun, troškovi i fakturisanje. Mora da ostane bar jedan aktivan admin.", "Admin: všetko. Projektový manažér: projekty, pridelenia, hodiny a B2B sadzby na svojich projektoch. HR: zamestnanci, osobné údaje, dokumenty, projekty a hodiny, bez peňazí. Financie: sadzby, schvaľovanie, mzdy, náklady a fakturácia. Musí zostať aspoň jeden aktívny admin."
            )}
          </p>
        </div>
      </div>

      {loadError ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
          <div className="space-y-2">
            <p>{L("Users could not be loaded:", "Korisnici nisu učitani:", "Používateľov sa nepodarilo načítať:")} {loadError.message}</p>
            <Button size="sm" variant="outline" onClick={refreshAll}>{L("Try again", "Pokušaj ponovo", "Skúsiť znova")}</Button>
          </div>
        </div>
      ) : loading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : (
        <Card className="overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="users-table">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium">{L("Name", "Ime i prezime", "Meno a priezvisko")}</th>
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium hidden md:table-cell">{L("Email", "Email", "E-mail")}</th>
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium">{L("Role", "Uloga", "Rola")}</th>
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium">{L("Active", "Aktivan", "Aktívny")}</th>
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium">{L("Projects", "Projekti", "Projekty")}</th>
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium">{L("Permissions", "Prava", "Oprávnenia")}</th>
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium hidden lg:table-cell">{L("Created", "Otvoren", "Vytvorený")}</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => {
                  const isMe = p.id === user?.id;
                  const last = isLastActiveAdmin(profiles, p.id);
                  const adminRow = p.role === "admin";
                  // Ulogu admin daje/oduzima samo admin; svoju ulogu ne menja niko osim admina (baza isto odbija).
                  const roleLocked = !isAdmin && (adminRow || isMe);
                  const n = overrideCount(p.id);
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`user-row-${p.email}`}>
                      <td className="px-2 sm:px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.full_name || p.email}</span>
                          {isMe && <Badge variant="secondary">{L("You", "Vi", "Vy")}</Badge>}
                          {!p.active && (
                            <Badge variant="outline" className="border-warning/40 bg-warning-soft text-warning">
                              {L("Inactive", "Neaktivan", "Neaktívny")}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground md:hidden">{p.email}</div>
                        {last && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {L("Last active admin", "Poslednji aktivan admin", "Posledný aktívny admin")}
                          </div>
                        )}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 hidden md:table-cell text-muted-foreground">{p.email || "—"}</td>
                      <td className="px-2 sm:px-3 py-2.5">
                        <Select value={p.role} onValueChange={(role) => role !== p.role && request(p, { role })} disabled={busy(p.id) || roleLocked}>
                          <SelectTrigger className="w-36 sm:w-40 h-8" aria-label={L("Role", "Uloga", "Rola")} data-testid={`user-role-${p.email}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.filter((r) => isAdmin || r !== "admin").map((r) => (
                              <SelectItem key={r} value={r}>{rl(r)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 sm:px-3 py-2.5">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={p.active}
                            onCheckedChange={(active) => request(p, { active: active === true })}
                            disabled={busy(p.id) || roleLocked}
                            aria-label={L("Active", "Aktivan", "Aktívny")}
                            data-testid={`user-active-${p.email}`}
                          />
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {p.active ? L("Active", "Aktivan", "Aktívny") : L("Inactive", "Neaktivan", "Neaktívny")}
                          </span>
                        </label>
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 text-xs whitespace-nowrap" data-testid={`user-scope-${p.email}`}>
                        {adminRow || p.project_scope !== "assigned"
                          ? L("All projects", "Svi projekti", "Všetky projekty")
                          : L(`Assigned: ${projectCount(p.id)}`, `Dodeljeni: ${projectCount(p.id)}`, `Pridelené: ${projectCount(p.id)}`)}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5">
                        <Button
                          variant="outline" size="sm" className="h-8 gap-1.5"
                          onClick={() => setEditing(p)}
                          disabled={adminRow || (isMe && !isAdmin)}
                          data-testid={`user-perms-${p.email}`}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          {adminRow
                            ? L("All", "Sva", "Všetky")
                            : n
                              ? L(`Role + ${n} changes`, `Uloga + ${n} izmena`, `Rola + ${n} zmien`)
                              : L("By role", "Po ulozi", "Podľa roly")}
                        </Button>
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">{fmtCreated(p.created_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <AccessDialog
          profile={profiles.find((p) => p.id === editing.id) || editing}
          roleDefaults={roleDefaults[editing.role] || []}
          overrides={overrides.filter((o) => o.user_id === editing.id)}
          assigned={access.filter((a) => a.user_id === editing.id).map((a) => a.project_id)}
          projects={projects}
          projectsLoading={projectsQ.isLoading}
          onScope={(project_scope) => change.mutate({ profile: editing, patch: { project_scope } })}
          onChanged={refreshAll}
          onClose={() => setEditing(null)}
        />
      )}

      {creating && (
        <CreateUserDialog
          projects={projects}
          roleDefaults={roleDefaults}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refreshAll();
          }}
        />
      )}

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{L("You are changing your own account", "Menjate svoj nalog", "Meníte vlastný účet")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.patch && "active" in confirm.patch
                ? L(
                    "After deactivation you won't be able to use the app until another admin activates you again.",
                    "Posle deaktivacije nećete moći da koristite aplikaciju dok vas drugi admin ponovo ne aktivira.", "Po deaktivácii nebudete môcť aplikáciu používať, kým vás iný admin znova neaktivuje."
                  )
                : L(
                    "Without the admin role you will only have the permissions of the new role (likely no settings, including this page). Only another admin can give you the admin role back.",
                    "Bez admin uloge imaćete samo prava nove uloge (verovatno bez podešavanja i ove stranice). Admin ulogu može da vam vrati samo drugi admin.", "Bez roly admin budete mať iba oprávnenia novej roly (pravdepodobne bez nastavení aj tejto stránky). Rolu admina vám môže vrátiť iba iný admin."
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{L("Cancel", "Otkaži", "Zrušiť")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                change.mutate(confirm);
                setConfirm(null);
              }}
            >
              {L("Yes, change", "Da, promeni", "Áno, zmeniť")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Dijalog: opseg projekata, dodeljeni projekti i pojedinačna prava jednog korisnika (nije admin).
function AccessDialog({ profile, roleDefaults, overrides, assigned, projects, projectsLoading, onScope, onChanged, onClose }) {
  const L = useL();
  const { lang } = useLang();
  const [pending, setPending] = useState(null); // kod prava ili id projekta koji se upisuje

  // Matrica prava: lokalno stanje, snima se odjednom (set_user_permissions → override-i u odnosu na ulogu).
  const effective = useMemo(() => [...userPermissions(profile, overrides, roleDefaults)].sort(), [profile, overrides, roleDefaults]);
  const [codes, setCodes] = useState(effective);
  const dirty = codes.length !== effective.length || codes.some((c) => !effective.includes(c));
  const savePermissions = useMutation({
    mutationFn: async () => {
      const { error } = await sb().rpc("set_user_permissions", { p_user: profile.id, p_codes: codes });
      if (error) throw dataError(error, "set_user_permissions");
    },
    onSuccess: () => toast.success(L("Permissions saved", "Prava su sačuvana", "Oprávnenia boli uložené")),
    onError: (e) => toast.error(e.message),
    onSettled: onChanged,
  });

  const [name, setName] = useState(profile.full_name || "");
  const saveName = useMutation({
    mutationFn: () => base44.entities.Profile.update(profile.id, { full_name: name.trim() }),
    onSuccess: () => toast.success(L("Name saved", "Ime je sačuvano", "Meno bolo uložené")),
    onError: (e) => toast.error(e.message),
    onSettled: onChanged,
  });

  const toggleProject = useMutation({
    mutationFn: async ({ projectId, on }) => {
      if (on) {
        await run(sb().from("user_project_access").upsert({ user_id: profile.id, project_id: projectId }, { onConflict: "user_id,project_id" }), "UserProjectAccess.add");
      } else {
        await run(sb().from("user_project_access").delete().eq("user_id", profile.id).eq("project_id", projectId), "UserProjectAccess.remove");
      }
    },
    onMutate: ({ projectId }) => setPending(projectId),
    onError: (e) => toast.error(e.message),
    onSettled: () => {
      setPending(null);
      onChanged();
    },
  });

  const assignedOnly = profile.project_scope === "assigned";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{profile.full_name || profile.email}</DialogTitle>
          <DialogDescription>
            {L(
              `Role: ${roleLabel(profile.role, "en")}. Boxes show the final permissions; a dot marks a change from the role.`,
              `Uloga: ${roleLabel(profile.role, "rs")}. Polja pokazuju konačna prava; tačka označava razliku u odnosu na ulogu.`,
              `Rola: ${roleLabel(profile.role, "sk")}. Polia ukazujú výsledné oprávnenia; bodka označuje zmenu oproti role.`
            )}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2" data-testid="user-name">
          <h3 className="text-sm font-semibold">{L("Name", "Ime i prezime", "Meno a priezvisko")}</h3>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 max-w-sm" aria-label={L("Name", "Ime i prezime", "Meno a priezvisko")} />
            <Button variant="outline" size="sm" className="h-9" disabled={!name.trim() || name.trim() === (profile.full_name || "") || saveName.isPending}
              onClick={() => saveName.mutate()}>
              {L("Save name", "Sačuvaj ime", "Uložiť meno")}
            </Button>
          </div>
        </section>

        <section className="space-y-3" data-testid="user-projects">
          <h3 className="text-sm font-semibold">{L("Project access", "Pristup projektima", "Prístup k projektom")}</h3>
          <Select value={profile.project_scope || "all"} onValueChange={(v) => v !== profile.project_scope && onScope(v)}>
            <SelectTrigger className="w-64 h-9" aria-label={L("Project access", "Pristup projektima", "Prístup k projektom")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L("All projects", "Svi projekti", "Všetky projekty")}</SelectItem>
              <SelectItem value="assigned">{L("Only assigned projects", "Samo dodeljeni projekti", "Iba pridelené projekty")}</SelectItem>
            </SelectContent>
          </Select>
          {assignedOnly && (
            projectsLoading ? (
              <Skeleton className="h-24 rounded-lg" />
            ) : projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{L("There are no projects yet.", "Još nema projekata.", "Zatiaľ nie sú žiadne projekty.")}</p>
            ) : (
              <>
                {assigned.length === 0 && (
                  <p className="text-xs text-warning">{L("No project assigned — this user sees no projects.", "Nijedan projekat nije dodeljen — korisnik ne vidi nijedan projekat.", "Nie je pridelený žiadny projekt — používateľ nevidí žiadny projekt.")}</p>
                )}
                <div className="grid sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto rounded-lg border p-2">
                  {projects.map((pr) => (
                    <label key={pr.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
                      <Checkbox
                        checked={assigned.includes(pr.id)}
                        disabled={pending === pr.id}
                        onCheckedChange={(on) => toggleProject.mutate({ projectId: pr.id, on: on === true })}
                      />
                      <span className="truncate">{pr.project_number ? `${pr.project_number} · ` : ""}{pr.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )
          )}
        </section>

        <section className="space-y-3 pt-2" data-testid="user-permissions">
          <h3 className="text-sm font-semibold">{L("What the user sees and can do", "Šta korisnik vidi i šta sme da radi", "Čo používateľ vidí a čo smie robiť")}</h3>
          <PermissionMatrix value={codes} onChange={setCodes} roleDefaults={roleDefaults} lang={lang} disabled={savePermissions.isPending} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={!dirty || savePermissions.isPending} onClick={() => setCodes(effective)}>
              {L("Discard changes", "Poništi izmene", "Zahodiť zmeny")}
            </Button>
            <Button disabled={!dirty || savePermissions.isPending} onClick={() => savePermissions.mutate()} data-testid="save-permissions">
              {L("Save permissions", "Sačuvaj prava", "Uložiť oprávnenia")}
            </Button>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
