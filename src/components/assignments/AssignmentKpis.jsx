// KPI kartice Project Assignments (§4.2) — računaju se nad istim filtriranim skupom kao tabela (assignmentKpis).
// Klik na karticu postavlja odgovarajući filter (realna filtrirana lista, T04).
import { CalendarClock, Layers, UserCheck, Users } from "lucide-react";
import { parseISO } from "date-fns";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate, shortDatePattern } from "@/lib/dateFormat";

function Kpi({ icon: Icon, title, value, hint, onClick, label }) {
  const body = (
    <Card className={cn("relative h-full overflow-hidden p-4", onClick && "transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md")}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5 text-foreground/80">{title}</p>
          <p className="mt-1 text-[28px] font-bold leading-8 tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="pointer-events-none absolute -bottom-6 -right-6 h-20 w-28 rounded-full bg-primary/5" aria-hidden />
    </Card>
  );
  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} aria-label={label || title}
      className="group block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
      {body}
    </button>
  );
}

/**
 * @param {object} props
 * @param {ReturnType<import("@/lib/assignments").assignmentKpis>} props.kpis
 * @param {number} props.projectCount  broj projekata u obuhvatu (za podnaslov „Across N projects")
 * @param {(patch: object) => void} props.onFilter
 */
export default function AssignmentKpis({ kpis, projectCount, loading, onFilter, inPeriod = false }) {
  const L = useL();
  const { lang } = useLang();
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
      </div>
    );
  }
  const monthEnd = formatDate(parseISO(kpis.monthEnd), shortDatePattern(lang), lang);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi icon={Users} title={L("Total Assignments", "Ukupno angažmana", "Pridelenia spolu")} value={kpis.total}
        hint={L(`Across ${projectCount} projects`, `Na ${projectCount} projekata`, `Na ${projectCount} projektoch`)} />
      <Kpi icon={UserCheck} title={L("Active Workers", "Aktivni radnici", "Aktívni pracovníci")} value={kpis.activeWorkers}
        hint={inPeriod
          ? L("Assigned in the period, counted once", "Angažovani u periodu, svako jednom", "Pridelení v období, každý raz")
          : L("Currently assigned, counted once", "Trenutno angažovani, svako jednom", "Aktuálne pridelení, každý raz")}
        onClick={() => onFilter(inPeriod ? { status: "" } : { mode: "active", status: "" })}
        label={L("Show active assignments", "Prikaži aktivne angažmane", "Zobraziť aktívne pridelenia")} />
      <Kpi icon={Layers} title={L("Active Projects", "Aktivni projekti", "Aktívne projekty")} value={kpis.activeProjects}
        hint={L("With workforce assigned", "Sa angažovanim radnicima", "S pridelenými pracovníkmi")}
        onClick={() => onFilter(inPeriod ? { status: "" } : { mode: "active", status: "" })}
        label={L("Show active assignments", "Prikaži aktivne angažmane", "Zobraziť aktívne pridelenia")} />
      <Kpi icon={CalendarClock} title={L("Expiring This Month", "Ističu ovog meseca", "Končia tento mesiac")} value={kpis.expiringThisMonth}
        hint={L(`Assignments end by ${monthEnd}`, `Angažmani koji se završavaju do ${monthEnd}`, `Pridelenia končiace do ${monthEnd}`)}
        onClick={() => onFilter({ mode: "all", status: "", expiring: "month" })}
        label={L("Show assignments expiring this month", "Prikaži angažmane koji ističu ovog meseca", "Zobraziť pridelenia končiace tento mesiac")} />
    </div>
  );
}
