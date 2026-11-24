// Istorija izmena troška (spec §8.2: „oba pogleda čuvaju istoriju izmena") iz audit_log (migracija 01, T-B).
// Čita se po jednom trošku (record_id) ili po celom projektu (project_id — tu se vide i obrisani troškovi).
// Šta korisnik sme da vidi određuje RLS audit_log-a; bez prava dobija jasnu poruku, ne prazan ekran.
import { useQuery } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, formatIsoDate } from "@/lib/dateFormat";
import { formatMoney } from "@/lib/projectCosts";
import { roleLabel } from "@/lib/permissions";
import { workerName } from "./costsShared";

const FIELD_ORDER = ["cost_date", "amount", "currency", "eur_rsd_rate", "fx_rate_date", "category", "subcategory", "description", "employee_id", "vendor_id", "billable", "receipt_name", "notes", "project_id"];
const HIDDEN = new Set(["eur_amount", "cost_category_id", "receipt_url", "created_by", "created_date", "updated_date", "id"]);

function useFieldLabels(T) {
  return {
    cost_date: T.date, amount: T.amount, currency: T.currency, eur_rsd_rate: T.rate, fx_rate_date: T.rateDate,
    category: T.category, subcategory: T.subcategory, description: T.description, employee_id: T.worker, vendor_id: T.vendor,
    billable: T.billable, receipt_name: T.receipt, notes: T.notes, project_id: T.project,
  };
}

export default function CostHistoryDialog({ open, onOpenChange, cost, projectId, lookup, T, lang }) {
  const labels = useFieldLabels(T);
  const query = cost ? { table_name: "project_costs", record_id: cost.id } : { table_name: "project_costs", project_id: projectId };
  const { data: events = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["project-costs", "history", cost?.id || projectId],
    queryFn: () => base44.entities.AuditLog.filter(query, "-occurred_at", 200),
    enabled: open && !!(cost?.id || projectId),
    retry: false,
  });
  const denied = isError && /permission|42501|row-level/i.test(`${error?.code} ${error?.message}`);

  const show = (field, value) => {
    if (value === null || value === undefined || value === "") return "—";
    if (field === "cost_date" || field === "fx_rate_date") return formatIsoDate(value, lang);
    if (field === "billable") return value ? "✓" : "✗";
    if (field === "project_id") return lookup.projects.find((p) => p.id === value)?.name || "—";
    if (field === "employee_id") return workerName(lookup.employees.find((e) => e.id === value));
    if (field === "vendor_id") return lookup.vendors.find((v) => v.id === value)?.name || "—";
    return String(value);
  };
  const actionLabel = (a) => (a === "insert" ? T.created : a === "delete" ? T.removed : T.updated);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="w-5 h-5 text-primary" />{T.historyTitle}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : denied ? (
          <p className="py-6 text-sm text-muted-foreground text-center">{T.historyNoAccess}</p>
        ) : isError ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-destructive">{T.historyError}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>{T.retry}</Button>
          </div>
        ) : events.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground text-center">{T.historyEmpty}</p>
        ) : (
          <ol className="space-y-3">
            {events.map((ev) => {
              const data = ev.action === "delete" ? ev.old_data : ev.new_data;
              const fields = ev.action === "update"
                ? FIELD_ORDER.filter((f) => (ev.changed_fields || []).includes(f))
                : [];
              const changedOther = (ev.changed_fields || []).filter((f) => !FIELD_ORDER.includes(f) && !HIDDEN.has(f));
              return (
                <li key={ev.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{actionLabel(ev.action)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(new Date(ev.occurred_at), "d.M.yyyy HH:mm", lang)}{ev.actor_role ? ` · ${roleLabel(ev.actor_role, lang)}` : ""}
                    </span>
                  </div>
                  {!cost && data && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {[data.category, data.description].filter(Boolean).join(" · ")}
                      {data.amount !== undefined && ` · ${formatMoney(data.amount, data.currency || "EUR")}`}
                    </p>
                  )}
                  {fields.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {fields.map((f) => (
                        <li key={f} className="text-xs">
                          <span className="text-muted-foreground">{labels[f]}:</span>{" "}
                          <span className="line-through text-muted-foreground">{show(f, ev.old_data?.[f])}</span>{" → "}
                          <span className="font-medium">{show(f, ev.new_data?.[f])}</span>
                        </li>
                      ))}
                      {changedOther.length > 0 && <li className="text-xs text-muted-foreground">{T.changedFields}: {changedOther.join(", ")}</li>}
                    </ul>
                  )}
                  {ev.action === "insert" && data && cost && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatMoney(data.amount, data.currency || "EUR")} · {data.category || "—"}{data.subcategory ? ` / ${data.subcategory}` : ""}
                    </p>
                  )}
                  {ev.reason && <p className="text-xs mt-1">{ev.reason}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
