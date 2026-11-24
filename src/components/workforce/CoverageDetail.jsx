// Detalj dana (klik na ćeliju Gantt-a ili red pokrivenosti): po smeni potrebno / planirano / odsutno / dostupno,
// ko pokriva, ko fali (i zašto), ko je slobodan za zamenu i predlozi zamena.
import { useMemo } from "react";
import { UserCheck, UserMinus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLang } from "@/lib/LanguageContext";
import { useL } from "@/lib/translations";
import { formatDate } from "@/lib/dateFormat";
import { coverageDetail, employeeName } from "@/lib/workforceUi";
import ReplacementSuggestions from "./ReplacementSuggestions";
import { STATUS_STYLE, shiftTitle, useStatusLabel } from "./common";

const toDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-center">
      <div className={`text-lg font-semibold tabular-nums ${tone || ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function NameList({ icon: Icon, title, empty, children, count }) {
  return (
    <div>
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" />{title} ({count})</h4>
      {count === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="space-y-1 text-sm">{children}</ul>}
    </div>
  );
}

export default function CoverageDetail({ selection, data, canManage, onClose, onAddRequirement }) {
  const L = useL();
  const { lang } = useLang();
  const label = useStatusLabel();
  const open = !!selection;

  const detail = useMemo(
    () =>
      selection
        ? coverageDetail({
            projectId: selection.projectId, projectRoleId: selection.projectRoleId, date: selection.date,
            requirements: data.requirements, assignments: data.assignments, schedules: data.schedules, leaves: data.leaves,
            shifts: data.shifts, employees: data.employees, projectRoles: data.roles,
          })
        : [],
    [selection, data]
  );
  const role = selection ? data.roles.find((r) => r.id === selection.projectRoleId) : null;
  const project = selection ? data.projects.find((p) => p.id === selection.projectId) : null;
  const shiftOf = (id) => data.shifts.find((s) => s.id === id);
  const absenceLabel = (kind, type) => (kind === "leave" || kind === "sick_leave" || kind === "other_absence" ? label(kind) : type || "");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="coverage-detail">
        {selection && (
          <>
            <DialogHeader>
              <DialogTitle>{role?.title || "—"}</DialogTitle>
              <DialogDescription>
                {project?.name} · {formatDate(toDate(selection.date), "EEEE d. MMMM yyyy", lang)}
              </DialogDescription>
            </DialogHeader>

            {detail.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground space-y-2">
                <p>{L("No required workforce is defined for this Job Role on this day, so there is no shortage or surplus to calculate.", "Za ovaj Job Role na ovaj dan nije zadat potreban broj radnika, pa nema manjka ni viška za izračun.", "Pre túto Job Role v tento deň nie je zadaný potrebný počet pracovníkov, preto nie je čo počítať ako nedostatok alebo prebytok.")}</p>
                {canManage && <Button size="sm" variant="outline" onClick={() => onAddRequirement({ project_id: selection.projectId, project_role_id: selection.projectRoleId, from: selection.date })}>{L("Add required workforce", "Dodaj potreban broj", "Pridať potrebný počet")}</Button>}
              </div>
            ) : (
              detail.map((d) => (
                <section key={d.shiftId} className="space-y-3 rounded-xl border p-3" data-testid="coverage-detail-shift">
                  <h3 className="text-sm font-semibold">{shiftTitle(shiftOf(d.shiftId))}</h3>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <Stat label={L("Required", "Potrebno", "Potrebné")} value={d.required} />
                    <Stat label={L("Planned", "Planirano", "Plánované")} value={d.planned} />
                    <Stat label={L("Absent", "Odsutno", "Neprítomní")} value={d.absent} />
                    <Stat label={L("Available", "Dostupno", "Dostupné")} value={d.available} />
                    <Stat label={L("Shortage", "Manjak", "Nedostatok")} value={d.deficit} tone={d.deficit > 0 ? "text-destructive" : ""} />
                    <Stat label={L("Surplus", "Višak", "Prebytok")} value={d.surplus} tone={d.surplus > 0 ? "text-success" : ""} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <NameList icon={UserCheck} title={L("Covering", "Pokrivaju", "Pokrývajú")} count={d.covering.length} empty={L("Nobody is covering this shift.", "Niko ne pokriva ovu smenu.", "Túto zmenu nikto nepokrýva.")}>
                      {d.covering.map((e) => <li key={e.id}>{employeeName(e)}</li>)}
                    </NameList>
                    <NameList icon={UserMinus} title={L("Missing (absent)", "Fali (odsutni)", "Chýbajú (neprítomní)")} count={d.absentWorkers.length} empty={L("Nobody planned is absent.", "Nijedan planirani radnik nije odsutan.", "Žiadny plánovaný pracovník nie je neprítomný.")}>
                      {d.absentWorkers.map((a) => (
                        <li key={a.employee.id} className="flex items-center gap-2">
                          {employeeName(a.employee)}
                          <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[a.kind]}`}>{absenceLabel(a.kind, a.leaveType)}</span>
                        </li>
                      ))}
                    </NameList>
                  </div>
                  <NameList icon={Users} title={L("Free for this shift", "Slobodni za ovu smenu", "Voľní na túto zmenu")} count={d.free.length} empty={L("No free qualified worker for this Job Role.", "Nema slobodnog kvalifikovanog radnika za ovaj Job Role.", "Pre túto Job Role nie je voľný kvalifikovaný pracovník.")}>
                    {d.free.map((f) => (
                      <li key={f.employeeId} className="flex items-center gap-2">
                        {employeeName(f.employee)}
                        {f.standby && <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_STYLE.standby}`}>{label("standby")}</span>}
                      </li>
                    ))}
                  </NameList>
                  {d.deficit > 0 && (
                    <ReplacementSuggestions
                      need={{ projectId: selection.projectId, projectRoleId: selection.projectRoleId, roleKey: role?.title_key, shiftId: d.shiftId, from: selection.date, to: selection.date }}
                      role={role}
                      data={data}
                      excludeEmployeeIds={d.absentWorkers.map((a) => a.employee.id)}
                    />
                  )}
                </section>
              ))
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
