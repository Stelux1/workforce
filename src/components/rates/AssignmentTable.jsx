import { Button } from "@/components/ui/button";
import { Pencil, Trash2, TriangleAlert } from "lucide-react";

const LABELS = {
  en: {
    employee: "Employee", project: "Project", role: "Role", vendor: "Vendor at start", period: "Period", status: "Status",
    planned: "Planned", active: "Active", completed: "Completed", cancelled: "Cancelled", direct: "Direct", noVendor: "No engagement",
  },
  rs: {
    employee: "Zaposleni", project: "Projekat", role: "Radno mesto", vendor: "Dobavljač na početku", period: "Period", status: "Status",
    planned: "Planirano", active: "Aktivno", completed: "Završeno", cancelled: "Otkazano", direct: "Direktno", noVendor: "Bez angažovanja",
  },
  sk: {
    employee: "Zamestnanec", project: "Projekt", role: "Rola", vendor: "Dodávateľ na začiatku", period: "Obdobie", status: "Stav",
    planned: "Plánované", active: "Aktívne", completed: "Dokončené", cancelled: "Zrušené", direct: "Priamy", noVendor: "Bez pracovného vzťahu",
  },
};

const fmtDate = (d) => (d ? d.split("-").reverse().join(".") : "—");

export default function AssignmentTable({ assignments = [], onEdit, onDelete, lang }) {
  const L = LABELS[lang] || LABELS.en;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-3 py-2.5 font-medium">{L.employee}</th>
            <th className="text-left px-3 py-2.5 font-medium">{L.project}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">{L.role}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">{L.vendor}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">{L.period}</th>
            <th className="text-left px-3 py-2.5 font-medium">{L.status}</th>
            <th className="px-3 py-2.5 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2.5 font-medium">{a.employee_name || "—"}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{a.project_name || "—"}</td>
              <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground">{a.position || "—"}</td>
              <td className="px-3 py-2.5 hidden md:table-cell">
                {a.vendor_name ? (
                  <span className="text-sm">{a.vendor_name}</span>
                ) : a.engagement_type === "direct_employee" ? (
                  <span className="text-xs text-muted-foreground">{L.direct}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                    <TriangleAlert className="w-3 h-3" /> {L.noVendor}
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                {fmtDate(a.start_date)} → {a.end_date ? fmtDate(a.end_date) : "∞"}
              </td>
              <td className="px-3 py-2.5">
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                  {L[a.status] || a.status}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1 justify-end">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(a)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(a.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}