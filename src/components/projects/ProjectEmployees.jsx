// Project → Workers (spec §2.2, §4.5): dodele projekta iz jedine evidencije (project_assignments) — iste zapise čitaju
// Project Assignments (/assignments), Timesheets, Workforce i Onboarding. Iste komponente kao Project Assignments:
// View (detalji i History), Add / Edit (buduće tarife od datuma) / Reassign (Transfer, Additional) / End / Cancel preko
// RPC-ova (baza: assignments.manage, preklapanje, dani sa satima). B2C/B2B samo uz rates.view_b2c / rates.view_b2b, po
// istom izboru tarife kao baza (decorateAssignments → rates.js v2), na referentni dan reda.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Ban, CalendarX2, ExternalLink, Eye, Pencil, Plus, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { decorateAssignments } from "@/lib/assignments";
import { negativeLabourMargin } from "@/lib/projectSite";
import NegativeMarginNote from "@/components/projects/NegativeMarginNote";
import { StatusPill } from "@/components/assignments/status";
import { RateCell } from "@/components/assignments/AssignmentsTable";
import AddAssignmentDialog from "@/components/assignments/AddAssignmentDialog";
import EditAssignmentDialog from "@/components/assignments/EditAssignmentDialog";
import ReassignDialog from "@/components/assignments/ReassignDialog";
import EndAssignmentDialog from "@/components/assignments/EndAssignmentDialog";
import AssignmentDetailDrawer from "@/components/assignments/AssignmentDetailDrawer";

const ORDER = { active: 0, ending_soon: 1, upcoming: 2, completed: 3, cancelled: 4 };

export default function ProjectEmployees({ project, onUpdated }) {
  const L = useL();
  const { lang } = useLang();
  const { can, permissions } = useAuth();
  const canAssign = Boolean(can?.("assignments.manage"));
  const seeB2B = Boolean(can?.("rates.view_b2b"));
  const seeB2C = Boolean(can?.("rates.view_b2c"));
  const access = { canManage: canAssign, seeB2B, seeB2C };
  const [showCancelled, setShowCancelled] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [reassign, setReassign] = useState(null); // { assignment, mode }
  const [endDialog, setEndDialog] = useState(null); // { assignment, mode }
  const [viewId, setViewId] = useState(null);

  const asgQ = useQuery({
    queryKey: ["project-assignments", project.id],
    queryFn: () => base44.entities.ProjectAssignment.filter({ project_id: project.id }, "-start_date"),
  });
  const ratesQ = useQuery({
    queryKey: ["rates", "project", project.id, "all"],
    queryFn: () => base44.entities.Rate.filter({ project_id: project.id }, "-effective_from"),
    enabled: seeB2B || seeB2C,
  });
  // Stara tarifa radnika (scope 'employee') je poslednji nivo izbora — učitava se samo za radnike sa ovog projekta.
  const employeeIds = useMemo(() => [...new Set((asgQ.data || []).map((a) => a.employee_id))], [asgQ.data]);
  const employeeRatesQ = useQuery({
    queryKey: ["rates", "employees", project.id, employeeIds],
    queryFn: () => base44.entities.Rate.filter({ scope: "employee", employee_id: employeeIds }),
    enabled: (seeB2B || seeB2C) && employeeIds.length > 0,
  });
  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: () => base44.entities.Employee.list("last_name") });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list("name"), enabled: canAssign });
  const { data: shifts = [] } = useQuery({ queryKey: ["shifts"], queryFn: () => base44.entities.Shift.list("sort", 500) });
  const { data: history = [] } = useQuery({
    queryKey: ["employment-history-all"],
    queryFn: () => base44.entities.EmploymentHistory.list("-start_date", 500),
    enabled: canAssign,
  });

  const rates = useMemo(() => [...(ratesQ.data || []), ...(employeeRatesQ.data || [])], [ratesQ.data, employeeRatesQ.data]);
  const decorated = useMemo(
    () => decorateAssignments(asgQ.data || [], { projects: [project], employees, rates, perms: permissions || [] }),
    [asgQ.data, project, employees, rates, permissions]
  );
  const rows = useMemo(
    () => decorated
      .filter((a) => showCancelled || a.displayStatus !== "cancelled")
      .sort((a, b) => ORDER[a.displayStatus] - ORDER[b.displayStatus] || String(a.employeeName).localeCompare(String(b.employeeName))),
    [decorated, showCancelled]
  );
  const activeEmployees = new Set(rows.filter((a) => a.displayStatus !== "cancelled" && a.displayStatus !== "completed").map((a) => a.employee_id));
  const cancelledCount = decorated.filter((a) => a.displayStatus === "cancelled").length;
  const viewRow = viewId ? decorated.find((a) => a.id === viewId) || null : null;
  const closed = (fn) => (o) => { if (!o) { fn(null); onUpdated?.(); } };
  const actions = {
    onView: (a) => setViewId(a.id),
    onEdit: (a) => setEdit(a),
    onTransfer: (a) => setReassign({ assignment: a, mode: "transfer" }),
    onAdditional: (a) => setReassign({ assignment: a, mode: "additional" }),
    onEnd: (a) => setEndDialog({ assignment: a, mode: "end" }),
    onCancel: (a) => setEndDialog({ assignment: a, mode: "cancel" }),
  };

  return (
    <div className="bg-card border rounded-xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">{L("Workers on the project", "Radnici na projektu", "Pracovníci na projekte")}</h2>
          <Badge variant="secondary" title={L("Workers with a current or upcoming assignment", "Radnici sa važećom ili predstojećom dodelom", "Pracovníci s aktuálnym alebo nadchádzajúcim pridelením")}>{activeEmployees.size}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/assignments?project=${project.id}&mode=all`}>
              {L("All assignments", "Svi angažmani", "Všetky pridelenia")}<ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </Button>
          {canAssign && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" />
              {L("Add assignment", "Dodaj radnika", "Pridať pridelenie")}
            </Button>
          )}
        </div>
      </div>

      {asgQ.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : asgQ.isError ? (
        <p className="text-sm text-destructive">{asgQ.error?.message}</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>{L("No workers assigned to this project yet.", "Na projektu još nema dodeljenih radnika.", "Na projekt zatiaľ nie sú pridelení pracovníci.")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((a) => {
            const open = a.displayStatus !== "cancelled";
            const b2c = a.b2c && !a.b2c.error ? a.b2c : null;
            const b2b = a.b2b && !a.b2b.error ? a.b2b : null;
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{a.employeeName}{a.employeeCode && <span className="ml-2 text-xs font-normal text-muted-foreground">{a.employeeCode}</span>}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {a.roleName || L("no job role", "bez Job Role", "bez pracovnej roly")} · {formatIsoDate(a.start_date, lang)} → {a.end_date ? formatIsoDate(a.end_date, lang) : "∞"}
                    {a.vendor_name ? ` · ${a.vendor_name}` : ""}
                  </p>
                  {seeB2B && seeB2C && b2c && b2b && b2c.currency === b2b.currency && negativeLabourMargin(b2c.rate, b2b.rate) && (
                    <div className="mt-1"><NegativeMarginNote L={L} compact /></div>
                  )}
                </div>
                {seeB2C && (
                  <div className="text-right text-xs">
                    <p className="text-muted-foreground">B2C</p>
                    <p className="font-semibold"><RateCell value={a.b2c} lang={lang} L={L} /></p>
                  </div>
                )}
                {seeB2B && (
                  <div className="text-right text-xs">
                    <p className="text-muted-foreground">B2B</p>
                    <p className="font-semibold"><RateCell value={a.b2b} lang={lang} L={L} /></p>
                  </div>
                )}
                <StatusPill status={a.displayStatus} />
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => actions.onView(a)} aria-label={L("View assignment", "Detalji angažmana", "Detail pridelenia")} title={L("View", "Detalji", "Detail")}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  {canAssign && open && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => actions.onEdit(a)} aria-label={L("Edit", "Izmeni", "Upraviť")} title={L("Edit", "Izmeni", "Upraviť")}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => actions.onTransfer(a)} aria-label={L("Reassign", "Preraspodeli", "Presunúť")} title={L("Reassign", "Preraspodeli", "Presunúť")}>
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => actions.onEnd(a)} aria-label={L("End assignment", "Završi dodelu", "Ukončiť pridelenie")} title={L("End assignment", "Završi dodelu", "Ukončiť pridelenie")}>
                        <CalendarX2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => actions.onCancel(a)} aria-label={L("Cancel assignment", "Poništi dodelu", "Zrušiť pridelenie")} title={L("Cancel assignment", "Poništi dodelu", "Zrušiť pridelenie")}>
                        <Ban className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cancelledCount > 0 && (
        <button type="button" className="mt-3 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline" onClick={() => setShowCancelled((v) => !v)}>
          {showCancelled
            ? L("Hide cancelled assignments", "Sakrij poništene dodele", "Skryť zrušené pridelenia")
            : L(`Show cancelled assignments (${cancelledCount})`, `Prikaži poništene dodele (${cancelledCount})`, `Zobraziť zrušené pridelenia (${cancelledCount})`)}
        </button>
      )}

      <AssignmentDetailDrawer open={Boolean(viewRow)} onOpenChange={(o) => !o && setViewId(null)} assignment={viewRow} shifts={shifts}
        access={access} actions={actions} />
      <AddAssignmentDialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) onUpdated?.(); }}
        project={project} employees={employees} history={history} />
      <EditAssignmentDialog open={Boolean(edit)} onOpenChange={closed(setEdit)} assignment={edit} today={edit?.today} />
      <ReassignDialog open={Boolean(reassign)} onOpenChange={closed(setReassign)} assignment={reassign?.assignment} mode={reassign?.mode}
        projects={projects.length ? projects : [project]} today={reassign?.assignment?.today} />
      <EndAssignmentDialog open={Boolean(endDialog)} onOpenChange={closed(setEndDialog)} assignment={endDialog?.assignment} mode={endDialog?.mode} />
    </div>
  );
}
