import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { RATE_LABELS } from "@/lib/rateEngine";

const HEAD = {
  en: { employee: "Employee", project: "Project", role: "Role", kind: "Type", rate: "Rate", effective: "Effective", level: "Level", status: "Status" },
  rs: { employee: "Zaposleni", project: "Projekat", role: "Radno mesto", kind: "Tip", rate: "Tarifa", effective: "Važenje", level: "Nivo", status: "Status" },
};

const fmtDate = (d) => (d ? d.split("-").reverse().join(".") : "—");

export default function RateTable({ rates = [], onEdit, onDelete, lang }) {
  const H = HEAD[lang] || HEAD.en;
  const R = RATE_LABELS[lang] || RATE_LABELS.en;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-3 py-2.5 font-medium">{H.employee}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">{H.project}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">{H.role}</th>
            <th className="text-left px-3 py-2.5 font-medium">{H.kind}</th>
            <th className="text-right px-3 py-2.5 font-medium">{H.rate}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">{H.effective}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">{H.level}</th>
            <th className="px-3 py-2.5 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {rates.map((rate) => (
            <tr key={rate.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2.5 font-medium">{rate.employee_name || "—"}</td>
              <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">{rate.project_name || "—"}</td>
              <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground">{rate.position || "—"}</td>
              <td className="px-3 py-2.5">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${rate.kind === "revenue" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {R[rate.kind] || rate.kind}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                {Number(rate.amount).toFixed(2)} {rate.currency || "EUR"}
                <span className="text-xs font-normal text-muted-foreground"> / {R[rate.unit] || rate.unit}</span>
              </td>
              <td className="px-3 py-2.5 hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                {fmtDate(rate.effective_from)} → {rate.effective_to ? fmtDate(rate.effective_to) : "∞"}
              </td>
              <td className="px-3 py-2.5 hidden lg:table-cell text-xs text-muted-foreground">{R[rate.scope] || rate.scope}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1 justify-end">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(rate)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(rate.id)}>
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