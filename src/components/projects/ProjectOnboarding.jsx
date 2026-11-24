// Kartica Project → Onboarding (spec §12): zahtevi po projektu i Job Role-u, status dokumentacije po radniku sa
// preciznim razlozima, preview paketa, Prepare (Ready samo bez nedostataka) i Download ZIP.
// Prikaz statusa računa src/lib/onboarding.js; sadržaj paketa, prava i audit određuje server (migracija 06, T19).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Download, FileArchive, FileCheck2, Lock, Pencil, Plus, ShieldAlert, Trash2,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import RequiredDocumentDialog, { validityRuleLabel } from "@/components/projects/RequiredDocumentDialog";
import { useAuth } from "@/lib/AuthContext";
import { useLang } from "@/lib/LanguageContext";
import { useL } from "@/lib/translations";
import { formatIsoDate } from "@/lib/dateFormat";
import { documentCategoryLabel, useDocumentTypes, useMyPermissions } from "@/lib/documentCategories";
import { isExportable, isoDate, projectOnboarding } from "@/lib/onboarding";
import { downloadOnboardingZip } from "@/lib/onboardingZip";

const STATUS_STYLE = {
  available: "bg-success-soft text-success",
  expiring_soon: "bg-warning-soft text-warning",
  missing: "bg-destructive/10 text-destructive",
  expired: "bg-destructive/10 text-destructive",
  not_permitted: "bg-muted text-muted-foreground",
  ready: "bg-success-soft text-success",
  action_required: "bg-destructive/10 text-destructive",
  incomplete: "bg-warning-soft text-warning",
};

function useStatusLabel() {
  const L = useL();
  return (s) => ({
    available: L("Available", "Dostupan", "K dispozícii"),
    missing: L("Missing", "Nedostaje", "Chýba"),
    expired: L("Expired", "Istekao", "Neplatný"),
    expiring_soon: L("Expiring soon", "Uskoro ističe", "Čoskoro vyprší"),
    not_permitted: L("Not permitted to export", "Izvoz nije dozvoljen", "Export nie je povolený"),
    ready: L("Ready for Onboarding", "Spreman za onboarding", "Pripravený na onboarding"),
    action_required: L("Action required", "Potrebna akcija", "Vyžaduje akciu"),
    incomplete: L("Incomplete", "Nepotpun", "Neúplný"),
  }[s] || s);
}

function StatusChip({ status, label }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status] || "bg-muted text-muted-foreground"}`}>
      {label(status)}
    </span>
  );
}

function ErrorNote({ error }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{describeError(error)}</span>
    </div>
  );
}

export default function ProjectOnboarding({ project }) {
  const L = useL();
  const { lang } = useLang();
  const label = useStatusLabel();
  const queryClient = useQueryClient();
  const { can, loading: permsLoading } = useMyPermissions(useAuth());
  const canManage = can("onboarding.manage");
  const canExport = can("onboarding.export");
  const canViewSensitive = can("documents.view_sensitive");
  const today = isoDate(new Date());

  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());
  const [reqDialog, setReqDialog] = useState(null);
  const [deleteReq, setDeleteReq] = useState(null);
  const [preview, setPreview] = useState(null); // { mode: 'prepare' | 'download', employeeIds, pkg? }

  const { data: docTypes = [] } = useDocumentTypes();
  const reqQ = useQuery({
    queryKey: ["required-documents", project.id],
    queryFn: () => base44.entities.RequiredDocument.filter({ project_id: project.id }),
  });
  const rolesQ = useQuery({
    queryKey: ["project-roles", project.id],
    queryFn: () => base44.entities.ProjectRole.filter({ project_id: project.id }, "sort"),
  });
  const asgQ = useQuery({
    queryKey: ["project-assignments", project.id],
    queryFn: () => base44.entities.ProjectAssignment.filter({ project_id: project.id }),
  });
  const employeeIds = useMemo(() => [...new Set((asgQ.data || []).filter((a) => a.status !== "cancelled").map((a) => a.employee_id))], [asgQ.data]);
  const empQ = useQuery({
    queryKey: ["onboarding-employees", project.id, employeeIds],
    queryFn: () => base44.entities.Employee.filter({ id: employeeIds }),
    enabled: employeeIds.length > 0,
  });
  const docsQ = useQuery({
    queryKey: ["onboarding-documents", project.id, employeeIds],
    queryFn: () => base44.entities.Document.filter({ employee_id: employeeIds }),
    enabled: employeeIds.length > 0,
  });
  const pkgQ = useQuery({
    queryKey: ["onboarding-packages", project.id],
    queryFn: () => base44.entities.OnboardingPackage.filter({ project_id: project.id }, "-prepared_at"),
    enabled: canManage || canExport,
  });
  const dlQ = useQuery({
    queryKey: ["onboarding-downloads", project.id, (pkgQ.data || []).map((p) => p.id)],
    queryFn: () => base44.entities.OnboardingPackageDownload.filter({ package_id: (pkgQ.data || []).map((p) => p.id) }, "-downloaded_at"),
    enabled: (pkgQ.data || []).length > 0,
  });

  const requirements = reqQ.data || [];
  const roles = rolesQ.data || [];
  const roleTitle = (id) => roles.find((r) => r.id === id)?.title;
  const typeLabel = (code) => documentCategoryLabel(code, lang, docTypes);

  const rows = useMemo(() => projectOnboarding({
    project, assignments: asgQ.data || [], employees: empQ.data || [], requirements,
    documents: docsQ.data || [], documentTypes: docTypes, today, canViewSensitive,
  }), [project, asgQ.data, empQ.data, requirements, docsQ.data, docTypes, today, canViewSensitive]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["required-documents", project.id] });
    queryClient.invalidateQueries({ queryKey: ["onboarding-packages", project.id] });
    queryClient.invalidateQueries({ queryKey: ["onboarding-downloads", project.id] });
  };

  const removeReq = useMutation({
    mutationFn: (id) => base44.entities.RequiredDocument.delete(id),
    onSuccess: () => {
      toast.success(L("Requirement removed", "Zahtev je uklonjen", "Požiadavka bola odstránená"));
      invalidate();
    },
  });

  const toggle = (setter, id) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const loading = reqQ.isLoading || rolesQ.isLoading || asgQ.isLoading || (employeeIds.length > 0 && (empQ.isLoading || docsQ.isLoading)) || permsLoading;
  const loadError = reqQ.error || rolesQ.error || asgQ.error || empQ.error || docsQ.error;
  const readyCount = rows.filter((r) => r.status === "ready").length;
  const sortedReqs = [...requirements].sort((a, b) =>
    (a.project_role_id ? 1 : 0) - (b.project_role_id ? 1 : 0)
    || (roleTitle(a.project_role_id) || "").localeCompare(roleTitle(b.project_role_id) || "")
    || typeLabel(a.document_type).localeCompare(typeLabel(b.document_type)));

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }
  if (loadError) return <ErrorNote error={loadError} />;

  return (
    <div className="space-y-6">
      {/* Sažetak */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 shadow-card">
          <p className="text-xs text-muted-foreground">{L("Workers on project", "Radnika na projektu", "Pracovníkov na projekte")}</p>
          <p className="text-2xl font-semibold mt-1">{rows.length}</p>
        </Card>
        <Card className="p-4 shadow-card">
          <p className="text-xs text-muted-foreground">{L("Ready for Onboarding", "Spremno za onboarding", "Pripravených na onboarding")}</p>
          <p className="text-2xl font-semibold mt-1 text-success">{readyCount}</p>
        </Card>
        <Card className="p-4 shadow-card">
          <p className="text-xs text-muted-foreground">{L("Action required", "Potrebna akcija", "Vyžaduje akciu")}</p>
          <p className={`text-2xl font-semibold mt-1 ${rows.length - readyCount ? "text-destructive" : ""}`}>{rows.length - readyCount}</p>
        </Card>
      </div>

      {/* Required Documents */}
      <Card className="shadow-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b">
          <div>
            <h3 className="font-semibold">{L("Required Documents", "Potrebna dokumenta", "Požadované dokumenty")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {L("Documents are taken from Employee Documents — nothing is uploaded twice.",
                "Dokumenta se uzimaju iz dokumenata radnika — ništa se ne otprema ponovo.",
                "Dokumenty sa berú z dokumentov zamestnanca — nič sa nenahráva znova.")}
            </p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setReqDialog({})} className="gap-1.5 shrink-0">
              <Plus className="w-4 h-4" /> {L("Add", "Dodaj", "Pridať")}
            </Button>
          )}
        </div>
        {sortedReqs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            {L("No required documents yet. Every worker is Ready until requirements are defined.",
              "Još nema zahteva. Dok se ne definišu, svaki radnik je spreman.",
              "Zatiaľ žiadne požiadavky. Kým nie sú definované, každý pracovník je pripravený.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-5 py-2.5 font-medium">{L("Document type", "Vrsta dokumenta", "Typ dokumentu")}</th>
                  <th className="px-3 py-2.5 font-medium">{L("Applies to", "Važi za", "Platí pre")}</th>
                  <th className="px-3 py-2.5 font-medium hidden md:table-cell">{L("Validity", "Važenje", "Platnosť")}</th>
                  <th className="px-3 py-2.5 font-medium">{L("Mandatory", "Obavezan", "Povinný")}</th>
                  <th className="px-3 py-2.5 font-medium hidden sm:table-cell">{L("ZIP export", "ZIP izvoz", "ZIP export")}</th>
                  {canManage && <th className="px-3 py-2.5 w-20" />}
                </tr>
              </thead>
              <tbody>
                {sortedReqs.map((q) => (
                  <tr key={q.id} className="border-b last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="font-medium">{typeLabel(q.document_type)}</span>
                      {q.notes && <p className="text-xs text-muted-foreground">{q.notes}</p>}
                    </td>
                    <td className="px-3 py-2.5">{q.project_role_id ? roleTitle(q.project_role_id) || "—" : L("All roles", "Sve uloge", "Všetky pozície")}</td>
                    <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{validityRuleLabel(q.validity_rule, L)}</td>
                    <td className="px-3 py-2.5">{q.mandatory ? L("Yes", "Da", "Áno") : L("No", "Ne", "Nie")}</td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">{q.exportable ? L("Allowed", "Dozvoljen", "Povolený") : L("Not allowed", "Nije dozvoljen", "Nepovolený")}</td>
                    {canManage && (
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={L("Edit", "Izmeni", "Upraviť")} onClick={() => setReqDialog({ requirement: q })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={L("Remove", "Ukloni", "Odstrániť")} onClick={() => setDeleteReq(q)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Status po radniku */}
      <Card className="shadow-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b">
          <div>
            <h3 className="font-semibold">{L("Worker readiness", "Spremnost radnika", "Pripravenosť pracovníkov")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {L("Checked against each worker's role and assignment period; re-checked on every change.",
                "Proverava se po ulozi i periodu angažmana; ponovo pri svakoj izmeni.",
                "Kontroluje sa podľa pozície a obdobia pridelenia; znova pri každej zmene.")}
            </p>
          </div>
          {canManage && rows.length > 0 && (
            <Button size="sm" className="gap-1.5" disabled={selected.size === 0}
              onClick={() => setPreview({ mode: "prepare", employeeIds: [...selected] })}>
              <FileArchive className="w-4 h-4" />
              {L("Prepare package", "Pripremi paket", "Pripraviť balík")}{selected.size ? ` (${selected.size})` : ""}
            </Button>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            {L("No workers are assigned to this project yet.", "Na projektu još nema angažovanih radnika.", "Na projekte zatiaľ nie sú pridelení pracovníci.")}
          </div>
        ) : (
          <div className="divide-y">
            {canManage && (
              <label className="flex items-center gap-3 px-5 py-2 text-xs text-muted-foreground bg-muted/30 cursor-pointer">
                <Checkbox
                  checked={selected.size === rows.length ? true : selected.size ? "indeterminate" : false}
                  onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.employee_id)) : new Set())}
                  aria-label={L("Select all", "Izaberi sve", "Vybrať všetko")}
                />
                {L("Select all workers", "Izaberi sve radnike", "Vybrať všetkých pracovníkov")}
              </label>
            )}
            {rows.map((r) => {
              const open = expanded.has(r.employee_id);
              return (
                <div key={r.employee_id} className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    {canManage && (
                      <Checkbox className="mt-1" checked={selected.has(r.employee_id)} onCheckedChange={() => toggle(setSelected, r.employee_id)}
                        aria-label={r.employee_name} />
                    )}
                    <button type="button" className="mt-0.5 text-muted-foreground" onClick={() => toggle(setExpanded, r.employee_id)}
                      aria-label={open ? L("Collapse", "Skupi", "Zbaliť") : L("Show documents", "Prikaži dokumenta", "Zobraziť dokumenty")}>
                      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.employee_name || "—"}</span>
                        <StatusChip status={r.status} label={label} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {roleTitle(r.assignment?.project_role_id) || r.assignment?.position || L("No Job Role", "Bez Job Role-a", "Bez pozície")}
                        {" · "}{formatIsoDate(r.assignment?.start_date, lang)} – {r.assignment?.end_date ? formatIsoDate(r.assignment.end_date, lang) : L("open-ended", "bez kraja", "bez konca")}
                      </p>
                      {r.reasons.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {r.reasons.map((x) => (
                            <li key={x.document_type} className="text-xs text-destructive flex items-center gap-1.5">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              {typeLabel(x.document_type)}: {label(x.status).toLowerCase()}
                              {x.expiration_date ? ` (${formatIsoDate(x.expiration_date, lang)})` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  {open && (
                    <div className="mt-3 ml-7 rounded-lg border overflow-x-auto">
                      {r.items.length === 0 ? (
                        <p className="p-3 text-xs text-muted-foreground">{L("No requirements apply to this role.", "Za ovu ulogu nema zahteva.", "Pre túto pozíciu nie sú požiadavky.")}</p>
                      ) : (
                        <table className="w-full text-xs">
                          <tbody>
                            {r.items.map((i) => (
                              <tr key={i.requirement_id} className="border-b last:border-0">
                                <td className="px-3 py-2 font-medium">{typeLabel(i.document_type)}{!i.mandatory && <span className="text-muted-foreground font-normal"> · {L("optional", "neobavezan", "nepovinný")}</span>}</td>
                                <td className="px-3 py-2 text-muted-foreground">{i.document_title || "—"}</td>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{i.expiration_date ? formatIsoDate(i.expiration_date, lang) : i.document_id ? L("no expiry", "bez isteka", "bez platnosti") : ""}</td>
                                <td className="px-3 py-2 text-right"><StatusChip status={i.status} label={label} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Pripremljeni paketi */}
      {(canManage || canExport) ? (
        <Card className="shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold">{L("Onboarding packages", "Onboarding paketi", "Onboardingové balíky")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {L("Every preparation and download is recorded (who, when, which documents).",
                "Svaka priprema i preuzimanje se beleži (ko, kada, koja dokumenta).",
                "Každá príprava a stiahnutie sa zaznamenáva (kto, kedy, ktoré dokumenty).")}
            </p>
          </div>
          {pkgQ.error ? <div className="p-4"><ErrorNote error={pkgQ.error} /></div>
            : pkgQ.isLoading ? <div className="p-4"><Skeleton className="h-12" /></div>
            : (pkgQ.data || []).length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                {canManage
                  ? L("No packages yet. Select workers above and choose Prepare package.", "Još nema paketa. Izaberite radnike iznad i kliknite „Pripremi paket“.", "Zatiaľ žiadne balíky. Vyberte pracovníkov vyššie a zvoľte Pripraviť balík.")
                  : L("No packages have been prepared for this project.", "Za ovaj projekat još nije pripremljen paket.", "Pre tento projekt zatiaľ nebol pripravený balík.")}
              </div>
            ) : (
              <div className="divide-y">
                {pkgQ.data.map((p) => {
                  const downloads = (dlQ.data || []).filter((d) => d.package_id === p.id);
                  const names = (p.manifest?.workers || []).map((w) => w.employee_name).join(", ");
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <FileCheck2 className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-[12rem]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{formatIsoDate(p.prepared_at, lang)} {new Date(p.prepared_at).toLocaleTimeString(lang === "en" ? "en-GB" : lang === "sk" ? "sk-SK" : "sr-Latn-RS", { hour: "2-digit", minute: "2-digit" })}</span>
                          <StatusChip status={p.status} label={(s) => (s === "ready" ? L("Ready", "Spreman", "Pripravený") : label(s))} />
                        </div>
                        <p className="text-xs text-muted-foreground truncate" title={names}>
                          {p.employee_ids.length} {L("worker(s)", "radnik(a)", "pracovník(ov)")}: {names}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {downloads.length
                            ? `${L("Downloaded", "Preuzeto", "Stiahnuté")} ${downloads.length}× · ${L("last", "poslednje", "naposledy")} ${formatIsoDate(downloads[0].downloaded_at, lang)}`
                            : L("Not downloaded yet", "Još nije preuzet", "Zatiaľ nestiahnutý")}
                        </p>
                      </div>
                      {canExport && (
                        <Button size="sm" variant="outline" className="gap-1.5"
                          onClick={() => setPreview({ mode: "download", employeeIds: p.employee_ids, pkg: p })}>
                          <Download className="w-4 h-4" /> {L("Download ZIP", "Preuzmi ZIP", "Stiahnuť ZIP")}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </Card>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          {L("You don't have permission to prepare or download onboarding packages.",
            "Nemate pravo da pripremate ili preuzimate onboarding pakete.",
            "Nemáte oprávnenie pripravovať alebo sťahovať onboardingové balíky.")}
        </div>
      )}

      {reqDialog && (
        <RequiredDocumentDialog open onClose={() => setReqDialog(null)} onSaved={invalidate} projectId={project.id}
          roles={roles} documentTypes={docTypes} requirement={reqDialog.requirement} />
      )}
      <ConfirmDeleteDialog
        open={!!deleteReq}
        onClose={() => setDeleteReq(null)}
        onConfirm={() => removeReq.mutate(deleteReq.id)}
        message={deleteReq ? L(`Remove the requirement "${typeLabel(deleteReq.document_type)}"? Worker statuses will be recalculated.`,
          `Ukloniti zahtev „${typeLabel(deleteReq.document_type)}“? Status radnika će se ponovo izračunati.`,
          `Odstrániť požiadavku „${typeLabel(deleteReq.document_type)}“? Stav pracovníkov sa prepočíta.`) : ""}
      />
      {preview && (
        <PackagePreviewDialog project={project} preview={preview} typeLabel={typeLabel} label={label}
          onClose={() => setPreview(null)}
          onPrepared={() => { setSelected(new Set()); invalidate(); }}
          onDownloaded={invalidate} />
      )}
    </div>
  );
}

// Preview paketa (spec §12.2): projekat, radnici, nazivi dokumenata, datumi isteka, nedostaci i zabrane izvoza.
// Podaci dolaze sa servera (onboarding_manifest) — isto što će server dozvoliti u ZIP-u.
function PackagePreviewDialog({ project, preview, typeLabel, label, onClose, onPrepared, onDownloaded }) {
  const L = useL();
  const { lang } = useLang();
  const [markReady, setMarkReady] = useState(true);
  const [progress, setProgress] = useState(null);
  const manifestQ = useQuery({
    queryKey: ["onboarding-manifest", project.id, [...preview.employeeIds].sort()],
    queryFn: () => base44.rpc("onboarding_manifest", { p_project: project.id, p_employee_ids: preview.employeeIds }),
    gcTime: 0,
    retry: false,
  });
  const m = manifestQ.data;
  const incomplete = m?.status === "incomplete";
  const allItems = (m?.workers || []).flatMap((w) => w.items);
  const included = allItems.filter(isExportable);
  const includedCount = new Set(included.map((i) => i.document_id)).size;
  const problems = allItems.filter((i) => i.mandatory && (i.status === "missing" || i.status === "expired")).length;
  const blocked = allItems.filter((i) => i.status === "not_permitted").length;

  const prepare = useMutation({
    mutationFn: () => base44.rpc("prepare_onboarding_package", { p_project: project.id, p_employee_ids: preview.employeeIds, p_ready: !incomplete && markReady }),
    onSuccess: () => {
      toast.success(L("Package prepared", "Paket je pripremljen", "Balík bol pripravený"));
      onPrepared();
      onClose();
    },
  });
  const download = useMutation({
    mutationFn: () => downloadOnboardingZip(preview.pkg.id, m, { onProgress: (done, total) => setProgress({ done, total }) }),
    onSuccess: ({ fileCount, skipped }) => {
      if (skipped.length) toast.warning(L(`${skipped.length} file(s) could not be read and were left out.`, `${skipped.length} fajl(ova) nije moguće pročitati i izostavljeno je.`, `${skipped.length} súbor(ov) sa nepodarilo načítať a boli vynechané.`));
      toast.success(L(`ZIP downloaded (${fileCount} documents)`, `ZIP je preuzet (${fileCount} dokumenata)`, `ZIP stiahnutý (${fileCount} dokumentov)`));
      onDownloaded();
      onClose();
    },
    onSettled: () => setProgress(null),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !download.isPending && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {preview.mode === "prepare" ? L("Prepare onboarding package", "Priprema onboarding paketa", "Príprava onboardingového balíka")
              : L("Download onboarding package", "Preuzimanje onboarding paketa", "Stiahnutie onboardingového balíka")}
          </DialogTitle>
          <DialogDescription>
            {project.name}{project.client_name ? ` · ${project.client_name}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto space-y-4">
          {manifestQ.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-32" /></div>
          ) : manifestQ.error ? (
            <ErrorNote error={manifestQ.error} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusChip status={m.status} label={(s) => (s === "ready" ? L("Complete", "Potpun", "Úplný") : label(s))} />
                <span className="text-muted-foreground">
                  {L("Documents in ZIP", "Dokumenata u ZIP-u", "Dokumentov v ZIP")}: <b className="text-foreground">{includedCount}</b>
                  {" · "}{L("Missing or invalid", "Nedostaje ili ne važi", "Chýba alebo neplatné")}: <b className={problems ? "text-destructive" : "text-foreground"}>{problems}</b>
                  {" · "}{L("Not permitted", "Bez dozvole izvoza", "Bez povolenia")}: <b className="text-foreground">{blocked}</b>
                </span>
              </div>
              {incomplete && (
                <div className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  {L("A mandatory document is missing or invalid. The package is Incomplete and cannot be marked Ready; available documents can still be reviewed and exported.",
                    "Obavezan dokument nedostaje ili ne važi. Paket je nepotpun i ne može biti označen kao spreman; dostupna dokumenta se i dalje mogu pregledati i izvesti.",
                    "Povinný dokument chýba alebo je neplatný. Balík je neúplný a nemôže byť označený ako pripravený; dostupné dokumenty je stále možné prezrieť a exportovať.")}
                </div>
              )}
              {m.workers.map((w) => (
                <div key={w.employee_id} className="rounded-lg border">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-muted/30">
                    <span className="font-medium text-sm">{w.employee_name}</span>
                    <span className="text-xs text-muted-foreground">{w.role_title || "—"} · {formatIsoDate(w.start_date, lang)} – {w.end_date ? formatIsoDate(w.end_date, lang) : L("open-ended", "bez kraja", "bez konca")}</span>
                    <span className="ml-auto"><StatusChip status={w.status} label={label} /></span>
                  </div>
                  {w.items.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">{L("No requirements apply.", "Nema zahteva.", "Žiadne požiadavky.")}</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {w.items.map((i) => (
                          <tr key={i.requirement_id} className="border-b last:border-0">
                            <td className="px-3 py-1.5 w-6">{isExportable(i) ? <CheckCircle2 className="w-3.5 h-3.5 text-success" aria-label={L("In ZIP", "U ZIP-u", "V ZIP")} /> : null}</td>
                            <td className="px-2 py-1.5 font-medium">{typeLabel(i.document_type)}{!i.mandatory && <span className="text-muted-foreground font-normal"> · {L("optional", "neobavezan", "nepovinný")}</span>}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{i.document_title || "—"}{i.document_id && !i.has_file ? ` · ${L("no file attached", "bez fajla", "bez súboru")}` : ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{i.expiration_date ? formatIsoDate(i.expiration_date, lang) : ""}</td>
                            <td className="px-3 py-1.5 text-right"><StatusChip status={i.status} label={label} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 sm:items-center">
          {preview.mode === "prepare" && m && (
            <label className={`flex items-center gap-2 text-sm mr-auto ${incomplete ? "text-muted-foreground" : ""}`}>
              <Checkbox checked={!incomplete && markReady} disabled={incomplete} onCheckedChange={(v) => setMarkReady(Boolean(v))} />
              {L("Mark as Ready", "Označi kao spreman", "Označiť ako pripravený")}
            </label>
          )}
          {progress && <span className="text-xs text-muted-foreground mr-auto">{L("Packing", "Pakovanje", "Balenie")} {progress.done}/{progress.total}…</span>}
          <Button variant="outline" onClick={onClose} disabled={download.isPending}>{L("Close", "Zatvori", "Zavrieť")}</Button>
          {preview.mode === "prepare" ? (
            <Button onClick={() => prepare.mutate()} disabled={!m || prepare.isPending}>
              {incomplete ? L("Prepare as Incomplete", "Pripremi kao nepotpun", "Pripraviť ako neúplný") : L("Prepare package", "Pripremi paket", "Pripraviť balík")}
            </Button>
          ) : (
            <Button className="gap-1.5" onClick={() => download.mutate()} disabled={!m || includedCount === 0 || download.isPending}>
              <Download className="w-4 h-4" /> {L("Download ZIP", "Preuzmi ZIP", "Stiahnuť ZIP")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
