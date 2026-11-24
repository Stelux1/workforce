// Dodele (project_assignments) — ista evidencija kao Project → Workers. Status je prikazni, iz datuma (§4.4).
// Umesto brisanja: End (završetak od datuma) ili Cancel (poništenje dodele bez rada).
import { Button } from "@/components/ui/button";
import { Ban, CalendarX2, Pencil, TriangleAlert } from "lucide-react";
import { useL } from "@/lib/translations";
import { formatIsoDate } from "@/lib/dateFormat";
import { assignmentStatus } from "@/lib/assignments";

export function useAssignmentStatusLabels() {
  const L = useL();
  return {
    active: L("Active", "Aktivna", "Aktívne"),
    upcoming: L("Upcoming", "Predstoji", "Nadchádzajúce"),
    ending_soon: L("Ending soon", "Uskoro ističe", "Čoskoro končí"),
    completed: L("Completed", "Završena", "Dokončené"),
    cancelled: L("Cancelled", "Poništena", "Zrušené"),
  };
}

export const STATUS_CLASS = {
  active: "bg-success-soft text-success",
  upcoming: "bg-secondary text-secondary-foreground",
  ending_soon: "bg-warning-soft text-warning",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};

export default function AssignmentTable({ assignments = [], onEdit, onEnd, onCancel, canManage = false, showProject = true, lang }) {
  const L = useL();
  const labels = useAssignmentStatusLabels();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-3 py-2.5 font-medium">{L("Employee", "Radnik", "Zamestnanec")}</th>
            {showProject && <th className="text-left px-3 py-2.5 font-medium">{L("Project", "Projekat", "Projekt")}</th>}
            <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">{L("Job role", "Job Role", "Pracovná rola")}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">{L("Payee", "Primalac isplate", "Príjemca platby")}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">{L("Period", "Period", "Obdobie")}</th>
            <th className="text-left px-3 py-2.5 font-medium">{L("Status", "Status", "Stav")}</th>
            {canManage && <th className="px-3 py-2.5 w-24"></th>}
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => {
            const status = assignmentStatus(a, today);
            const closed = status === "cancelled";
            return (
              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2.5 font-medium">{a.employee_name || "—"}</td>
                {showProject && <td className="px-3 py-2.5 text-muted-foreground">{a.project_name || "—"}</td>}
                <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground">{a.position || "—"}</td>
                <td className="px-3 py-2.5 hidden md:table-cell">
                  {a.vendor_name ? (
                    <span className="text-sm">{a.vendor_name}</span>
                  ) : a.engagement_type === "direct_employee" ? (
                    <span className="text-xs text-muted-foreground">{L("Direct employee", "Direktno zaposlen", "Priamy zamestnanec")}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-warning">
                      <TriangleAlert className="w-3 h-3" /> {L("No engagement", "Bez angažmana", "Bez pracovného vzťahu")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                  {formatIsoDate(a.start_date, lang)} → {a.end_date ? formatIsoDate(a.end_date, lang) : "∞"}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[status]}`}>{labels[status]}</span>
                </td>
                {canManage && (
                  <td className="px-3 py-2.5">
                    {!closed && (
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(a)} aria-label={L("Edit", "Izmeni", "Upraviť")} title={L("Edit", "Izmeni", "Upraviť")}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEnd(a)} aria-label={L("End assignment", "Završi dodelu", "Ukončiť pridelenie")} title={L("End assignment", "Završi dodelu", "Ukončiť pridelenie")}>
                          <CalendarX2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onCancel(a)} aria-label={L("Cancel assignment", "Poništi dodelu", "Zrušiť pridelenie")} title={L("Cancel assignment", "Poništi dodelu", "Zrušiť pridelenie")}>
                          <Ban className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
