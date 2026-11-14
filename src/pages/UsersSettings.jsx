import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import PageHeader from "@/components/shared/PageHeader";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";
import { formatDate, longDatePattern } from "@/lib/dateFormat";
import { ROLES, isLastActiveAdmin, needsSelfConfirm } from "@/lib/userAccounts";

// Podešavanja → „Korisnici" (samo admin, /settings je u src/lib/access.js). Admin aktivira i deaktivira naloge i
// menja ulogu; baza dozvoljava izmenu samo adminu i ne pušta da nestane poslednji aktivan admin (migracija
// 20261114260000). Nalozi i lozinke se ne prave ovde (D14).
export default function UsersSettings() {
  const L = useL();
  const { lang } = useLang();
  const { user, checkAppState } = useAuth();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(null); // { profile, patch } — admin sebi oduzima pristup

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => base44.entities.Profile.list("created_date"),
  });

  const roleLabel = (role) => (role === "admin" ? L("Admin", "Admin") : L("Operator", "Operater"));

  const change = useMutation({
    mutationFn: ({ profile, patch }) => base44.entities.Profile.update(profile.id, patch),
    onSuccess: (_row, { profile, patch }) => {
      const who = profile.full_name || profile.email;
      if ("active" in patch) {
        toast.success(patch.active ? L(`Account activated: ${who}`, `Nalog je aktiviran: ${who}`) : L(`Account deactivated: ${who}`, `Nalog je deaktiviran: ${who}`));
      } else {
        toast.success(L(`Role changed to ${roleLabel(patch.role)}: ${who}`, `Uloga je promenjena u ${roleLabel(patch.role)}: ${who}`));
      }
      // Promena sopstvenog naloga: ponovo učitaj profil (bez admin uloge stranica više nije dostupna).
      if (profile.id === user?.id) checkAppState();
    },
    // I posle odbijene izmene (npr. poslednji aktivan admin) prikaz se vraća na stanje iz baze.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const request = (profile, patch) => {
    if (needsSelfConfirm(profiles, profile, patch, user?.id)) setConfirm({ profile, patch });
    else change.mutate({ profile, patch });
  };

  const busy = (id) => change.isPending && change.variables?.profile?.id === id;
  const fmtCreated = (d) => (d ? formatDate(new Date(d), longDatePattern(lang), lang) : "—");

  return (
    <div className="space-y-6">
      <PageHeader
        title={L("Users", "Korisnici")}
        subtitle={L(
          "Accounts that can sign in to the app: activate them and choose their role",
          "Nalozi koji mogu da se prijave u aplikaciju: aktivirajte ih i odredite ulogu"
        )}
      />

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" data-testid="users-note">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p>
            {L(
              "Accounts are not created here and passwords are not changed here. A new person's account is opened in Supabase (Authentication → Users); it waits inactive, as an operator, until you activate it on this page.",
              "Nalozi se ovde ne otvaraju i lozinke se ovde ne menjaju. Nalog za novu osobu se otvara u Supabase-u (Authentication → Users) i čeka neaktivan, kao operater, dok ga ovde ne aktivirate."
            )}
          </p>
          <p>
            {L(
              "Admin: everything, including payroll, rates and settings. Operator: employees, projects and hours entry, without money data. At least one active admin must remain.",
              "Admin: sve, uključujući obračun, tarife i podešavanja. Operater: radnici, projekti i unos sati, bez novčanih podataka. Mora da ostane bar jedan aktivan admin."
            )}
          </p>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="users-table">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium">{L("Name", "Ime i prezime")}</th>
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium hidden md:table-cell">{L("Email", "Email")}</th>
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium">{L("Role", "Uloga")}</th>
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium">{L("Active", "Aktivan")}</th>
                  <th className="text-left px-2 sm:px-3 py-2.5 font-medium hidden sm:table-cell">{L("Created", "Otvoren")}</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => {
                  const isMe = p.id === user?.id;
                  const last = isLastActiveAdmin(profiles, p.id);
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`user-row-${p.email}`}>
                      <td className="px-2 sm:px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.full_name || p.email}</span>
                          {isMe && <Badge variant="secondary">{L("You", "Vi")}</Badge>}
                          {!p.active && (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                              {L("Inactive", "Neaktivan")}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground md:hidden">{p.email}</div>
                        {last && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {L("Last active admin", "Poslednji aktivan admin")}
                          </div>
                        )}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 hidden md:table-cell text-muted-foreground">{p.email || "—"}</td>
                      <td className="px-2 sm:px-3 py-2.5">
                        <Select value={p.role} onValueChange={(role) => role !== p.role && request(p, { role })} disabled={busy(p.id)}>
                          <SelectTrigger className="w-28 sm:w-32 h-8" aria-label={L("Role", "Uloga")} data-testid={`user-role-${p.email}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 sm:px-3 py-2.5">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={p.active}
                            onCheckedChange={(active) => request(p, { active: active === true })}
                            disabled={busy(p.id)}
                            aria-label={L("Active", "Aktivan")}
                            data-testid={`user-active-${p.email}`}
                          />
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {p.active ? L("Active", "Aktivan") : L("Inactive", "Neaktivan")}
                          </span>
                        </label>
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">{fmtCreated(p.created_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{L("You are changing your own account", "Menjate svoj nalog")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.patch && "active" in confirm.patch
                ? L(
                    "After deactivation you won't be able to use the app until another admin activates you again.",
                    "Posle deaktivacije nećete moći da koristite aplikaciju dok vas drugi admin ponovo ne aktivira."
                  )
                : L(
                    "As an operator you will no longer see payroll, rates or settings (including this page). Only another admin can give you the admin role back.",
                    "Kao operater više nećete videti obračun, tarife ni podešavanja (ni ovu stranicu). Admin ulogu može da vam vrati samo drugi admin."
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{L("Cancel", "Otkaži")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                change.mutate(confirm);
                setConfirm(null);
              }}
            >
              {L("Yes, change", "Da, promeni")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
