import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { requireSupabase } from "@/api/supabase";
import { dataError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { ROLE_DEFAULTS, diffFromRole, roleLabel } from "@/lib/permissions";
import PermissionMatrix from "@/components/users/PermissionMatrix";
import { ROLES, generatePassword, validateNewUser } from "@/lib/userAccounts";

// Novi korisnik (D31): otvara ga samo admin — baza (admin_create_user) to proverava i pravi nalog, profil, projekte i
// celu matricu prava (razlika u odnosu na ulogu) u jednoj transakciji. Nalog je odmah aktivan; lozinku admin predaje osobi.
// `roleDefaults` = { uloga: [kodovi] } iz baze (role_permissions); bez njih seed ROLE_DEFAULTS.
export default function CreateUserDialog({ projects = [], roleDefaults = {}, onCreated, onClose }) {
  const L = useL();
  const { lang } = useLang();
  const [form, setForm] = useState({ full_name: "", email: "", password: generatePassword(), role: "hr", project_scope: "all" });
  const [projectIds, setProjectIds] = useState([]);
  const defaultsOf = (role) => roleDefaults[role] || ROLE_DEFAULTS[role] || [];
  const [codes, setCodes] = useState(() => defaultsOf("hr")); // konačna prava korisnika
  const [showPassword, setShowPassword] = useState(true);
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const changeRole = (role) => {
    setForm((f) => ({ ...f, role }));
    setCodes(defaultsOf(role)); // nova uloga = polazna prava te uloge
  };
  const isAdminRole = form.role === "admin";

  const create = useMutation({
    mutationFn: async () => {
      const diff = diffFromRole(codes, defaultsOf(form.role));
      const { data, error } = await requireSupabase().rpc("admin_create_user", {
        p_email: form.email.trim(),
        p_password: form.password,
        p_full_name: form.full_name.trim(),
        p_role: form.role,
        p_project_scope: isAdminRole ? "all" : form.project_scope,
        p_project_ids: !isAdminRole && form.project_scope === "assigned" ? projectIds : [],
        p_denied: isAdminRole ? [] : diff.denied,
        p_granted: isAdminRole ? [] : diff.granted,
      });
      if (error) {
        if (error.code === "23505") {
          throw new Error(L("An account with this email already exists.", "Nalog sa ovom email adresom već postoji.", "Účet s týmto e-mailom už existuje."));
        }
        throw dataError(error, "admin_create_user");
      }
      return data;
    },
    onSuccess: (id) => {
      toast.success(L(`Account created: ${form.email.trim()}`, `Nalog je otvoren: ${form.email.trim()}`, `Účet bol vytvorený: ${form.email.trim()}`));
      onCreated?.(id);
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e) => {
    e.preventDefault();
    const errs = validateNewUser(form);
    setErrors(errs);
    if (Object.keys(errs).length === 0) create.mutate();
  };

  const msg = {
    email: L("Enter a valid email address.", "Unesite ispravnu email adresu.", "Zadajte platnú e-mailovú adresu."),
    password: L("The password must have at least 10 characters.", "Lozinka mora da ima bar 10 znakova.", "Heslo musí mať aspoň 10 znakov."),
  };


  return (
    <Dialog open onOpenChange={(open) => !open && !create.isPending && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="create-user-dialog">
        <DialogHeader>
          <DialogTitle>{L("New user", "Novi korisnik", "Nový používateľ")}</DialogTitle>
          <DialogDescription>
            {L(
              "The account is active right away. Give the person their email and password; they sign in on the login page.",
              "Nalog je odmah aktivan. Osobi predajte email i lozinku; prijavljuje se na stranici za prijavu.",
              "Účet je hneď aktívny. Odovzdajte osobe e-mail a heslo; prihlási sa na prihlasovacej stránke."
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nu-name">{L("Full name", "Ime i prezime", "Meno a priezvisko")}</Label>
              <Input id="nu-name" value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nu-email">{L("Email", "Email", "E-mail")} *</Label>
              <Input id="nu-email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} autoComplete="off"
                aria-invalid={Boolean(errors.email)} data-testid="new-user-email" />
              {errors.email && <p className="text-xs text-destructive">{msg.email}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="nu-password">{L("Initial password", "Početna lozinka", "Počiatočné heslo")} *</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input id="nu-password" type={showPassword ? "text" : "password"} value={form.password}
                    onChange={(e) => set("password")(e.target.value)} autoComplete="new-password" className="pr-9 font-mono"
                    aria-invalid={Boolean(errors.password)} data-testid="new-user-password" />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? L("Hide password", "Sakrij lozinku", "Skryť heslo") : L("Show password", "Prikaži lozinku", "Zobraziť heslo")}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => set("password")(generatePassword())}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  {L("Generate", "Generiši", "Generovať")}
                </Button>
              </div>
              {errors.password ? (
                <p className="text-xs text-destructive">{msg.password}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{L("At least 10 characters.", "Bar 10 znakova.", "Aspoň 10 znakov.")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{L("Role", "Uloga", "Rola")}</Label>
              <Select value={form.role} onValueChange={changeRole}>
                <SelectTrigger aria-label={L("Role", "Uloga", "Rola")} data-testid="new-user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{roleLabel(r, lang)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!isAdminRole && (
              <div className="space-y-1.5">
                <Label>{L("Project access", "Pristup projektima", "Prístup k projektom")}</Label>
                <Select value={form.project_scope} onValueChange={set("project_scope")}>
                  <SelectTrigger aria-label={L("Project access", "Pristup projektima", "Prístup k projektom")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{L("All projects", "Svi projekti", "Všetky projekty")}</SelectItem>
                    <SelectItem value="assigned">{L("Only assigned projects", "Samo dodeljeni projekti", "Iba pridelené projekty")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!isAdminRole && form.project_scope === "assigned" && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{L("Assigned projects", "Dodeljeni projekti", "Pridelené projekty")}</h3>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">{L("There are no projects yet.", "Još nema projekata.", "Zatiaľ nie sú žiadne projekty.")}</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto rounded-lg border p-2">
                  {projects.map((pr) => (
                    <label key={pr.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
                      <Checkbox checked={projectIds.includes(pr.id)}
                        onCheckedChange={(on) => setProjectIds((ids) => (on === true ? [...ids, pr.id] : ids.filter((x) => x !== pr.id)))} />
                      <span className="truncate">{pr.project_number ? `${pr.project_number} · ` : ""}{pr.name}</span>
                    </label>
                  ))}
                </div>
              )}
              {projectIds.length === 0 && projects.length > 0 && (
                <p className="text-xs text-warning">{L("No project assigned — this user will see no projects.", "Nijedan projekat nije dodeljen — korisnik neće videti nijedan projekat.", "Nie je pridelený žiadny projekt — používateľ neuvidí žiadny projekt.")}</p>
              )}
            </section>
          )}

          <section className="space-y-2" data-testid="new-user-permissions">
            <h3 className="text-sm font-semibold">{L("What the user sees and can do", "Šta korisnik vidi i šta sme da radi", "Čo používateľ vidí a čo smie robiť")}</h3>
            {isAdminRole ? (
              <p className="text-sm text-muted-foreground">{L("Admin sees and can do everything.", "Admin vidi i sme sve.", "Admin vidí a smie všetko.")}</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {L(
                    "The role is the starting point; change any box. “View everything” gives read-only access to all sections.",
                    "Uloga je polazna tačka; svako polje možete da promenite. „Samo pregled svega\" daje samo čitanje svih sekcija.",
                    "Rola je východiskový bod; každé pole môžete zmeniť. „Iba prezeranie všetkého\" dáva len čítanie všetkých sekcií."
                  )}
                </p>
                <PermissionMatrix value={codes} onChange={setCodes} roleDefaults={defaultsOf(form.role)} lang={lang} />
              </>
            )}
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>{L("Cancel", "Otkaži", "Zrušiť")}</Button>
            <Button type="submit" disabled={create.isPending} className="gap-1.5" data-testid="new-user-submit">
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {L("Create user", "Napravi korisnika", "Vytvoriť používateľa")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
