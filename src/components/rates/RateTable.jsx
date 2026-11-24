// Rate History: svi redovi tarifa sa nivoom izbora (angažman → Job Role → projekat → radnik), valutom i periodom.
// Akcije zavise od prava (rates.manage); baza ih proverava ponovo (guard_rate_history, RLS).
import { Button } from "@/components/ui/button";
import { History, Pencil, Trash2 } from "lucide-react";
import { useL } from "@/lib/translations";
import { formatIsoDate } from "@/lib/dateFormat";
import { RATE_LABELS } from "@/lib/rateEngine";
import { RATE_SOURCES, rateLevel } from "@/lib/payroll/rates";

export function useRateLevelLabels() {
  const L = useL();
  return {
    [RATE_SOURCES.ASSIGNMENT_RATE]: L("Assignment rate", "Tarifa angažmana", "Sadzba pridelenia"),
    [RATE_SOURCES.ROLE_RATE]: L("Job role rate", "Tarifa Job Role", "Sadzba pracovnej roly"),
    [RATE_SOURCES.PROJECT_RATE]: L("Whole project", "Ceo projekat", "Celý projekt"),
    [RATE_SOURCES.EMPLOYEE_RATE]: L("Employee (legacy)", "Radnik (stari unos)", "Zamestnanec (starý záznam)"),
  };
}

export default function RateTable({ rates = [], onChange, onEdit, onDelete, canManage = false, lang }) {
  const L = useL();
  const R = RATE_LABELS[lang] || RATE_LABELS.en;
  const levels = useRateLevelLabels();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-3 py-2.5 font-medium">{L("Applies to", "Važi za", "Platí pre")}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">{L("Project", "Projekat", "Projekt")}</th>
            <th className="text-left px-3 py-2.5 font-medium">{L("Type", "Vrsta", "Typ")}</th>
            <th className="text-right px-3 py-2.5 font-medium">{L("Rate", "Tarifa", "Sadzba")}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">{L("Valid", "Važenje", "Platnosť")}</th>
            <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">{L("Reason / note", "Razlog / napomena", "Dôvod / poznámka")}</th>
            {canManage && <th className="px-3 py-2.5 w-24"></th>}
          </tr>
        </thead>
        <tbody>
          {rates.map((rate) => {
            const level = rateLevel(rate);
            const inactive = rate.status !== "active";
            const ended = rate.effective_to && rate.effective_to < today;
            const target = level === RATE_SOURCES.ROLE_RATE || level === RATE_SOURCES.PROJECT_RATE
              ? rate.position || levels[level]
              : rate.employee_name || "—";
            return (
              <tr key={rate.id} className={`border-b last:border-0 hover:bg-muted/30 ${inactive ? "opacity-60" : ""}`}>
                <td className="px-3 py-2.5">
                  <p className="font-medium">{target}</p>
                  <p className="text-xs text-muted-foreground">{levels[level]}{inactive ? ` · ${L("inactive", "neaktivna", "neaktívna")}` : ""}</p>
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">{rate.project_name || "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${rate.kind === "revenue" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
                    {rate.kind === "revenue" ? "B2B" : "B2C"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">
                  {Number(rate.amount).toFixed(2)} {rate.currency || "EUR"}
                  <span className="text-xs font-normal text-muted-foreground"> / {R[rate.unit] || rate.unit}</span>
                </td>
                <td className="px-3 py-2.5 hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                  {formatIsoDate(rate.effective_from, lang)} → {rate.effective_to ? formatIsoDate(rate.effective_to, lang) : "∞"}
                  {rate.superseded_by && <span className="block">{L("replaced by a newer rate", "zamenjena novom tarifom", "nahradená novšou sadzbou")}</span>}
                  {!rate.superseded_by && ended && !inactive && <span className="block">{L("ended", "istekla", "skončená")}</span>}
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell text-xs text-muted-foreground max-w-[16rem] truncate" title={[rate.change_reason, rate.notes].filter(Boolean).join(" · ")}>
                  {[rate.change_reason, rate.notes].filter(Boolean).join(" · ") || "—"}
                </td>
                {canManage && (
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      {!inactive && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onChange(rate)}
                          title={L("Change from date", "Promeni od datuma", "Zmeniť od dátumu")} aria-label={L("Change from date", "Promeni od datuma", "Zmeniť od dátumu")}>
                          <History className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(rate)}
                        title={L("Edit end date, status or note", "Izmeni kraj, status ili napomenu", "Upraviť koniec, stav alebo poznámku")} aria-label={L("Edit", "Izmeni", "Upraviť")}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(rate.id)} aria-label={L("Delete", "Obriši", "Odstrániť")}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
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
