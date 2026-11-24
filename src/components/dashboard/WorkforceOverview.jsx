import { Link } from "react-router-dom";
import { ArrowRight, UserCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useL } from "@/lib/translations";

function Bars({ rows, max, to }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <Link to={to(r)} className="block rounded-md px-1 py-0.5 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="font-semibold tabular-nums">{r.workers}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-primary/10" aria-hidden>
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(4, (r.workers / max) * 100)}%` }} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Workforce Overview (spec §3.3): aktivni radnici, raspoloživi radnici danas, raspodela po projektima i pozicijama.
 * `data` = workforceOverview(...) ili null dok se učitava. Svaki red vodi na filtriranu listu dodela.
 */
export default function WorkforceOverview({ data, loading, error, assignmentsTo, projectTo, positionTo }) {
  const L = useL();
  const top = (rows) => rows.slice(0, 5);
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{L("Workforce Overview", "Pregled radne snage", "Prehľad pracovnej sily")}</CardTitle>
          <Link to={assignmentsTo} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
            {L("View All", "Prikaži sve", "Zobraziť všetko")} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : error ? (
          <p className="text-sm text-destructive py-6 text-center">{L("Workforce data could not be loaded.", "Podaci o radnoj snazi nisu učitani.", "Údaje o pracovnej sile sa nepodarilo načítať.")}</p>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Link to={assignmentsTo} className="rounded-xl bg-primary/5 p-3 hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="w-4 h-4 text-primary" />{L("Active Workers", "Aktivni radnici", "Aktívni pracovníci")}</span>
                <span className="mt-1 block text-2xl font-bold">{data.activeWorkers}</span>
              </Link>
              <div className="rounded-xl bg-success-soft p-3">
                <span className="flex items-center gap-2 text-xs text-muted-foreground"><UserCheck className="w-4 h-4 text-success" />{L("Available Workers (today)", "Raspoloživi radnici (danas)", "Dostupní pracovníci (dnes)")}</span>
                <span className="mt-1 block text-2xl font-bold">{data.availableToday}</span>
                <span className="text-xs text-muted-foreground">{L(`of ${data.activeEmployees} active employees`, `od ${data.activeEmployees} aktivnih zaposlenih`, `z ${data.activeEmployees} aktívnych zamestnancov`)}</span>
              </div>
            </div>
            {data.byProject.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{L("No active assignments in this period.", "Nema aktivnih angažmana u ovom periodu.", "V tomto období nie sú aktívne pridelenia.")}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">{L("By project", "Po projektima", "Podľa projektov")}</p>
                  <Bars rows={top(data.byProject)} max={Math.max(...data.byProject.map((r) => r.workers))} to={projectTo} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">{L("By position", "Po pozicijama", "Podľa pozícií")}</p>
                  {data.byPosition.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{L("No positions assigned.", "Pozicije nisu dodeljene.", "Pozície nie sú priradené.")}</p>
                  ) : (
                    <Bars rows={top(data.byPosition)} max={Math.max(...data.byPosition.map((r) => r.workers))} to={positionTo} />
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
