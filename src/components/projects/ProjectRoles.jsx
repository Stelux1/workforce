// Project → Overview: Job Roles projekta (project_roles) i njihove projektne tarife (rates scope 'project' +
// project_role_id; B2B po pravilu, B2C podrazumevani za ulogu) — spec §2.2, §5, docs/TEAMORA-DATA-MODEL.md §2.3/§2.5.
// Job Role menja projects.manage; tarife vidi rates.view_b2b / rates.view_b2c, a menja rates.manage (baza: RLS,
// guard_rate_history). Preimenovanje uloge osvežava snimke naziva na dodelama i tarifama (T25).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Briefcase, ChevronDown, ChevronRight, Pencil, Plus, Power } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";
import { currentRate } from "@/lib/payroll/rates";
import { negativeLabourMargin } from "@/lib/projectSite";
import NegativeMarginNote from "@/components/projects/NegativeMarginNote";
import RateDialog from "@/components/rates/RateDialog";
import RateTable from "@/components/rates/RateTable";

const today = () => new Date().toISOString().slice(0, 10);
const money = (r) => (r ? `${Number(r.amount).toFixed(2)} ${r.currency}/h` : "—");

export default function ProjectRoles({ project, onUpdated }) {
  const L = useL();
  const { lang } = useLang();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canEditRoles = Boolean(can?.("projects.manage"));
  const canRates = Boolean(can?.("rates.manage"));
  const seeB2B = canRates || Boolean(can?.("rates.view_b2b"));
  const seeB2C = canRates || Boolean(can?.("rates.view_b2c"));

  const [roleDialog, setRoleDialog] = useState(null); // { role | null }
  const [title, setTitle] = useState("");
  const [position, setPosition] = useState("");
  const [rateDialog, setRateDialog] = useState(null);
  const [openRole, setOpenRole] = useState(null);

  const rolesQ = useQuery({
    queryKey: ["project-roles", project.id],
    queryFn: () => base44.entities.ProjectRole.filter({ project_id: project.id }, "sort"),
  });
  const ratesQ = useQuery({
    queryKey: ["rates", "project", project.id],
    queryFn: () => base44.entities.Rate.filter({ project_id: project.id, scope: "project" }, "-effective_from"),
    enabled: seeB2B || seeB2C,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["department-configs"],
    queryFn: () => base44.entities.DepartmentConfig.list("name", 200),
    enabled: canEditRoles,
  });
  const positions = useMemo(
    () => [...new Set(departments.flatMap((d) => (d.positions || []).map((p) => (typeof p === "string" ? p : p?.name)).filter(Boolean)))],
    [departments]
  );

  const roles = rolesQ.data || [];
  const rates = ratesQ.data || [];
  const roleRates = (roleId, kind) => rates.filter((r) => r.project_role_id === roleId && (!kind || r.kind === kind));
  const projectWide = rates.filter((r) => !r.project_role_id && !String(r.position || "").trim() && r.status === "active");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["project-roles"] });
    queryClient.invalidateQueries({ queryKey: ["project-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["rates"] });
    onUpdated?.();
  };

  const saveRole = useMutation({
    mutationFn: () => {
      const data = { title: title.trim(), department_position: position || null };
      return roleDialog.role
        ? base44.entities.ProjectRole.update(roleDialog.role.id, data)
        : base44.entities.ProjectRole.create({ ...data, project_id: project.id, sort: roles.length });
    },
    onSuccess: () => {
      refresh();
      toast.success(L("Job role saved", "Job Role sačuvan", "Pracovná rola uložená"));
      setRoleDialog(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const toggleRole = useMutation({
    mutationFn: (role) => base44.entities.ProjectRole.update(role.id, { status: role.status === "active" ? "inactive" : "active" }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  const openRoleDialog = (role) => {
    setTitle(role?.title || "");
    setPosition(role?.department_position || "");
    setRoleDialog({ role: role || null });
  };
  const duplicate = roles.some((r) => r.id !== roleDialog?.role?.id && r.title.trim().toLowerCase() === title.trim().toLowerCase());

  const setRoleRate = (role, kind) => {
    const current = currentRate(rates, (r) => r.project_role_id === role.id && r.kind === kind, today());
    setRateDialog(current
      ? { mode: "change", rate: current }
      : { mode: "create", defaults: { scope: "role", kind, project_id: project.id, project_role_id: role.id, lockTarget: true, lockKind: true } });
  };

  return (
    <div className="bg-card border rounded-xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">{seeB2B ? L("Job roles and rates", "Job Roles i tarife", "Pracovné roly a sadzby") : L("Job roles", "Job Roles", "Pracovné roly")}</h2>
          <Badge variant="secondary">{roles.filter((r) => r.status === "active").length}</Badge>
        </div>
        {canEditRoles && (
          <Button size="sm" onClick={() => openRoleDialog(null)}>
            <Plus className="w-4 h-4" />
            {L("Add job role", "Dodaj Job Role", "Pridať pracovnú rolu")}
          </Button>
        )}
      </div>

      {rolesQ.isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : rolesQ.isError ? (
        <p className="text-sm text-destructive">{rolesQ.error?.message}</p>
      ) : roles.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>{L("No job roles yet. Workers are assigned to a job role, and B2B rates are set per role.",
            "Još nema Job Roles. Radnici se dodeljuju na Job Role, a B2B tarife se određuju po ulozi.",
            "Zatiaľ žiadne pracovné roly. Pracovníci sa prideľujú na rolu a sadzby B2B sa určujú podľa roly.")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => {
            const b2b = currentRate(rates, (r) => r.project_role_id === role.id && r.kind === "revenue", today());
            const b2c = currentRate(rates, (r) => r.project_role_id === role.id && r.kind === "cost", today());
            const expanded = openRole === role.id;
            const inactive = role.status !== "active";
            return (
              <div key={role.id} className={`rounded-lg border bg-muted/40 ${inactive ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  {(seeB2B || seeB2C) ? (
                    <button type="button" onClick={() => setOpenRole(expanded ? null : role.id)} className="text-muted-foreground"
                      aria-expanded={expanded} aria-label={L("Rate history", "Istorija tarifa", "História sadzieb")}>
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{role.title}{inactive ? ` · ${L("inactive", "neaktivan", "neaktívna")}` : ""}</p>
                    {role.department_position && role.department_position !== role.title && (
                      <p className="text-xs text-muted-foreground">{role.department_position}</p>
                    )}
                  </div>
                  {seeB2B && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">B2B</p>
                      <p className={`font-semibold tabular-nums ${b2b ? "" : "text-warning"}`}>{b2b ? money(b2b) : L("missing", "nema", "chýba")}</p>
                    </div>
                  )}
                  {seeB2C && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{L("B2C default", "B2C podrazumevano", "B2C predvolené")}</p>
                      <p className="font-semibold tabular-nums">{money(b2c)}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    {canRates && !inactive && (
                      <>
                        <Button variant="outline" size="sm" className="h-7" onClick={() => setRoleRate(role, "revenue")}>
                          {b2b ? L("Change B2B", "Promeni B2B", "Zmeniť B2B") : L("Set B2B", "Unesi B2B", "Zadať B2B")}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7" onClick={() => setRoleRate(role, "cost")}>
                          {b2c ? L("Change B2C", "Promeni B2C", "Zmeniť B2C") : L("Set B2C", "Unesi B2C", "Zadať B2C")}
                        </Button>
                      </>
                    )}
                    {canEditRoles && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openRoleDialog(role)} aria-label={L("Rename", "Preimenuj", "Premenovať")}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleRole.mutate(role)}
                          aria-label={inactive ? L("Activate", "Aktiviraj", "Aktivovať") : L("Deactivate", "Deaktiviraj", "Deaktivovať")}
                          title={inactive ? L("Activate", "Aktiviraj", "Aktivovať") : L("Deactivate — existing assignments keep the role", "Deaktiviraj — postojeće dodele zadržavaju ulogu", "Deaktivovať — existujúce pridelenia si rolu ponechajú")}>
                          <Power className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {seeB2B && seeB2C && b2b && b2c && b2b.currency === b2c.currency && negativeLabourMargin(Number(b2c.amount), Number(b2b.amount)) && (
                  <div className="px-3 pb-3"><NegativeMarginNote L={L} compact /></div>
                )}
                {expanded && (
                  <div className="border-t bg-card">
                    {roleRates(role.id).length === 0 ? (
                      <p className="p-3 text-xs text-muted-foreground">{L("No rates for this role yet.", "Za ovu ulogu još nema tarifa.", "Pre túto rolu zatiaľ nie sú sadzby.")}</p>
                    ) : (
                      <RateTable rates={roleRates(role.id)} canManage={canRates} lang={lang}
                        onChange={(rate) => setRateDialog({ mode: "change", rate })}
                        onEdit={(rate) => setRateDialog({ mode: "edit", rate })}
                        onDelete={(id) => base44.entities.Rate.delete(id).then(refresh, (e) => toast.error(e.message))} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {seeB2B && projectWide.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {L("This project also has a whole-project rate (older entry); it applies only where a job role has no rate.",
            "Projekat ima i tarifu za ceo projekat (stari unos); važi samo gde Job Role nema tarifu.",
            "Projekt má aj sadzbu celého projektu (starý záznam); platí iba tam, kde rola nemá sadzbu.")}
        </p>
      )}

      <Dialog open={Boolean(roleDialog)} onOpenChange={(o) => !o && setRoleDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{roleDialog?.role ? L("Edit job role", "Izmena Job Role", "Upraviť pracovnú rolu") : L("Add job role", "Dodaj Job Role", "Pridať pracovnú rolu")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {positions.length > 0 && (
              <div className="space-y-1.5">
                <Label>{L("Position (Departments & Positions)", "Pozicija (Odeljenja i pozicije)", "Pozícia (Oddelenia a pozície)")}</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={position}
                  onChange={(e) => { setPosition(e.target.value); if (!title || title === position) setTitle(e.target.value); }}>
                  <option value="">{L("— none —", "— bez —", "— žiadna —")}</option>
                  {positions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{L("Job role name *", "Naziv Job Role *", "Názov pracovnej roly *")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              {duplicate && <p className="text-xs text-destructive">{L("This job role already exists on the project.", "Ovaj Job Role već postoji na projektu.", "Táto pracovná rola už na projekte existuje.")}</p>}
              {roleDialog?.role && (
                <p className="text-xs text-muted-foreground">{L("Renaming updates the name on assignments and rates; history stays linked.", "Preimenovanje menja naziv na dodelama i tarifama; istorija ostaje povezana.", "Premenovanie zmení názov na prideleniach a sadzbách; história ostáva prepojená.")}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)}>{L("Cancel", "Odustani", "Zrušiť")}</Button>
            <Button onClick={() => saveRole.mutate()} disabled={!title.trim() || duplicate || saveRole.isPending}>{L("Save", "Sačuvaj", "Uložiť")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RateDialog open={Boolean(rateDialog)} onOpenChange={(o) => { if (!o) { setRateDialog(null); refresh(); } }}
        mode={rateDialog?.mode} rate={rateDialog?.rate} defaults={rateDialog?.defaults} projects={[project]} />
    </div>
  );
}
