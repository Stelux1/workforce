// Project → Workers (spec §2.2, §4.5): dodele projekta iz jedine evidencije (project_assignments) — iste zapise čitaju
// /rates, Timesheets, Workforce i Onboarding. Add/Edit/End/Cancel idu kroz RPC-ove (baza: assignments.manage,
// preklapanje, dani sa satima). B2C/B2B se prikazuju samo uz rates.view_b2c / rates.view_b2b i to po istom izboru
// tarife kao baza (rates.js v2), za današnji dan.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarX2, Ban, Pencil, Plus, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { assignmentStatus } from "@/lib/assignments";
import { resolveSideRate } from "@/lib/payroll/rates";
import { negativeLabourMargin } from "@/lib/projectSite";
import NegativeMarginNote from "@/components/projects/NegativeMarginNote";
import AssignmentDialog, { EndAssignmentDialog } from "@/components/rates/AssignmentDialog";
import { STATUS_CLASS, useAssignmentStatusLabels } from "@/components/rates/AssignmentTable";

const ORDER = { active: 0, ending_soon: 1, upcoming: 2, completed: 3, cancelled: 4 };

function rateFor(side, assignment, date, rates) {
  try {
    return resolveSideRate(side, {
      date, employeeId: assignment.employee_id, projectId: assignment.project_id, assignmentId: assignment.id, assignments: [assignment], rates,
    });
  } catch {
    return null; // nema tarife ili nije po satu — prikazuje se kao upozorenje
  }
}

export default function ProjectEmployees({ project, onUpdated }) {
  const L = useL();
  const { lang } = useLang();
  const { can } = useAuth();
  const canAssign = Boolean(can?.("assignments.manage"));
  const seeB2B = Boolean(can?.("rates.view_b2b") || can?.("rates.manage"));
  const seeB2C = Boolean(can?.("rates.view_b2c") || can?.("rates.manage"));
  const statusLabels = useAssignmentStatusLabels();
  const [showCancelled, setShowCancelled] = useState(false);
  const [dialog, setDialog] = useState(null); // { assignment | null }
  const [endDialog, setEndDialog] = useState(null);

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
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("last_name"),
    enabled: canAssign,
  });
  const { data: history = [] } = useQuery({
    queryKey: ["employment-history-all"],
    queryFn: () => base44.entities.EmploymentHistory.list("-start_date", 500),
    enabled: canAssign,
  });

  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => {
    const list = (asgQ.data || []).map((a) => ({ ...a, displayStatus: assignmentStatus(a, today) }));
    return list
      .filter((a) => showCancelled || a.displayStatus !== "cancelled")
      .sort((a, b) => ORDER[a.displayStatus] - ORDER[b.displayStatus] || String(a.employee_name).localeCompare(String(b.employee_name)));
  }, [asgQ.data, showCancelled, today]);
  const activeEmployees = new Set(rows.filter((a) => a.displayStatus !== "cancelled" && a.displayStatus !== "completed").map((a) => a.employee_id));
  const cancelledCount = (asgQ.data || []).filter((a) => a.status === "cancelled").length;
  const rates = useMemo(() => [...(ratesQ.data || []), ...(employeeRatesQ.data || [])], [ratesQ.data, employeeRatesQ.data]);

  return (
    <div className="bg-card border rounded-xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">{L("Workers on the project", "Radnici na projektu", "Pracovníci na projekte")}</h2>
          <Badge variant="secondary" title={L("Workers with a current or upcoming assignment", "Radnici sa važećom ili predstojećom dodelom", "Pracovníci s aktuálnym alebo nadchádzajúcim pridelením")}>{activeEmployees.size}</Badge>
        </div>
        {canAssign && (
          <Button size="sm" onClick={() => setDialog({ assignment: null })}>
            <Plus className="w-4 h-4" />
            {L("Add assignment", "Dodaj radnika", "Pridať pridelenie")}
          </Button>
        )}
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
            const b2c = seeB2C ? rateFor("worker", a, a.displayStatus === "upcoming" ? a.start_date : a.displayStatus === "completed" ? a.end_date : today, rates) : null;
            const b2b = seeB2B ? rateFor("client", a, a.displayStatus === "upcoming" ? a.start_date : a.displayStatus === "completed" ? a.end_date : today, rates) : null;
            const open = a.displayStatus !== "cancelled";
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{a.employee_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {a.position || L("no job role", "bez Job Role", "bez pracovnej roly")} · {formatIsoDate(a.start_date, lang)} → {a.end_date ? formatIsoDate(a.end_date, lang) : "∞"}
                    {a.vendor_name ? ` · ${a.vendor_name}` : ""}
                  </p>
                  {seeB2B && seeB2C && b2c && b2b && b2c.currency === b2b.currency && negativeLabourMargin(b2c.rate, b2b.rate) && (
                    <div className="mt-1"><NegativeMarginNote L={L} compact /></div>
                  )}
                </div>
                {seeB2C && (
                  <div className="text-right text-xs">
                    <p className="text-muted-foreground">B2C</p>
                    <p className={`font-semibold tabular-nums ${b2c ? "text-foreground" : "text-warning"}`}>{b2c ? `${b2c.rate.toFixed(2)} ${b2c.currency}/h` : L("missing", "nema", "chýba")}</p>
                  </div>
                )}
                {seeB2B && (
                  <div className="text-right text-xs">
                    <p className="text-muted-foreground">B2B</p>
                    <p className={`font-semibold tabular-nums ${b2b ? "text-foreground" : "text-warning"}`}>{b2b ? `${b2b.rate.toFixed(2)} ${b2b.currency}/h` : L("missing", "nema", "chýba")}</p>
                  </div>
                )}
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[a.displayStatus]}`}>{statusLabels[a.displayStatus]}</span>
                {canAssign && open && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialog({ assignment: a })} aria-label={L("Edit", "Izmeni", "Upraviť")} title={L("Edit", "Izmeni", "Upraviť")}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEndDialog({ assignment: a, mode: "end" })} aria-label={L("End assignment", "Završi dodelu", "Ukončiť pridelenie")} title={L("End assignment", "Završi dodelu", "Ukončiť pridelenie")}>
                      <CalendarX2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEndDialog({ assignment: a, mode: "cancel" })} aria-label={L("Cancel assignment", "Poništi dodelu", "Zrušiť pridelenie")} title={L("Cancel assignment", "Poništi dodelu", "Zrušiť pridelenie")}>
                      <Ban className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
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

      <AssignmentDialog open={Boolean(dialog)} onOpenChange={(o) => { if (!o) { setDialog(null); onUpdated?.(); } }}
        assignment={dialog?.assignment} project={project} employees={employees} history={history} />
      <EndAssignmentDialog open={Boolean(endDialog)} onOpenChange={(o) => { if (!o) { setEndDialog(null); onUpdated?.(); } }}
        assignment={endDialog?.assignment} mode={endDialog?.mode} />
    </div>
  );
}
