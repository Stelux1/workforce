// Quick Insights (§4.3) — desni panel: statusi (donut), angažmani po projektu, slobodni radnici, Ending Soon i
// Workforce Shortages. Sve kartice prate isti filtrirani skup i isti referentni dan kao tabela (T02); klik vodi na
// realnu filtriranu listu ili u Workforce Planning (T04).
import { useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart } from "recharts";
import { parseISO } from "date-fns";
import { AlertTriangle, ArrowRight, CalendarClock, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { intlLocale } from "@/lib/dateFormat";
import { formatDate, shortDatePattern } from "@/lib/dateFormat";
import { insightFilterPatch } from "@/lib/assignments";
import { STATUS_META, useAssignmentStatusLabels } from "./status";

const WHOLE_DAY = "__day";
const TOP_PROJECTS = 5;

function StatusDonut({ breakdown, activeStatus, onPick }) {
  const L = useL();
  const { lang } = useLang();
  const labels = useAssignmentStatusLabels();
  const data = breakdown.total
    ? breakdown.items.filter((i) => i.count > 0)
    : [{ status: "empty", count: 1 }];
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative h-[136px] w-[136px] shrink-0">
        <PieChart width={136} height={136}>
          <Pie data={data} dataKey="count" nameKey="status" innerRadius={46} outerRadius={66} startAngle={90} endAngle={-270}
            stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}
            onClick={(d) => breakdown.total && onPick(d?.payload?.status ?? d?.status)}>
            {data.map((d) => (
              <Cell key={d.status} fill={d.status === "empty" ? "hsl(var(--muted))" : STATUS_META[d.status].chart}
                className={breakdown.total ? "cursor-pointer outline-none" : undefined}
                opacity={activeStatus && d.status !== activeStatus ? 0.35 : 1} />
            ))}
          </Pie>
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums tracking-tight">{breakdown.total}</span>
          <span className="text-xs text-muted-foreground">{L("Total", "Ukupno", "Spolu")}</span>
        </div>
      </div>
      <ul className="min-w-[170px] flex-1 space-y-1">
        {breakdown.items.map((i) => (
          <li key={i.status}>
            <button type="button" onClick={() => onPick(i.status)} aria-pressed={activeStatus === i.status}
              className={cn("flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                activeStatus === i.status && "bg-primary/10")}>
              <span className="inline-flex items-center gap-2 text-foreground/80">
                <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_META[i.status].swatch)} aria-hidden />
                {labels[i.status]}
              </span>
              <span className="font-medium tabular-nums">{i.count} <span className="text-muted-foreground">({new Intl.NumberFormat(intlLocale(lang), { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(i.pct / 100)})</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectBars({ items, activeProject, onPick }) {
  const L = useL();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, TOP_PROJECTS);
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{L("Assignments by Project", "Angažmani po projektu", "Pridelenia podľa projektu")}</h3>
        {items.length > TOP_PROJECTS && (
          <button type="button" onClick={() => setAll((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {all ? L("Show top 5", "Prikaži prvih 5", "Zobraziť top 5") : L(`View all (${items.length})`, `Prikaži sve (${items.length})`, `Zobraziť všetky (${items.length})`)}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">{L("No assignments in this view.", "Nema angažmana u ovom prikazu.", "V tomto zobrazení nie sú pridelenia.")}</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((p) => (
            <li key={p.projectId}>
              <button type="button" onClick={() => onPick(p.projectId)} aria-pressed={activeProject === p.projectId}
                title={L("Show this project's assignments", "Prikaži angažmane ovog projekta", "Zobraziť pridelenia projektu")}
                className={cn("grid w-full grid-cols-[minmax(0,1fr)_96px_28px] items-center gap-3 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  activeProject === p.projectId && "bg-primary/10")}>
                <span className="truncate text-foreground/80">{p.projectName || "—"}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(p.count / max) * 100}%`, opacity: 0.35 + 0.65 * (p.count / max) }} />
                </span>
                <span className="text-right font-medium tabular-nums">{p.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InsightRow({ icon: Icon, tone = "primary", title, value, hint, to, onClick, children, ariaLabel }) {
  const iconBox = tone === "warning" ? "bg-warning-soft text-warning" : tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";
  const inner = (
    <>
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconBox)}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-foreground/80">{title}</span>
        <span className="block text-2xl font-bold leading-7 tabular-nums">{value}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <div className="border-t pt-3">
      {to ? <Link to={to} className={cls} aria-label={ariaLabel || title}>{inner}</Link> : <button type="button" onClick={onClick} className={cls} aria-label={ariaLabel || title}>{inner}</button>}
      {children}
    </div>
  );
}

/**
 * @param {object} props
 * @param {{total, items}} props.breakdown            statusBreakdown
 * @param {{projectId, projectName, count}[]} props.projects  byProject
 * @param {number} props.endingSoonCount
 * @param {{loading, error, count, date, shiftId, shifts, onDate, onShift, to}} props.available
 * @param {{loading, error, count, from, to, link}} props.shortages
 * @param {{status, project}} props.filters
 * @param {(patch) => void} props.onFilter
 */
export default function QuickInsights({ breakdown, projects, endingSoonCount, available, shortages, filters, onFilter, loading }) {
  const L = useL();
  const { lang } = useLang();
  const short = (iso) => (iso ? formatDate(parseISO(iso), shortDatePattern(lang), lang) : "");
  const dash = (state) => (state.loading ? "…" : state.error ? "—" : state.count);

  return (
    <Card className="h-full p-4 sm:p-5">
      <h2 className="text-lg font-semibold">{L("Quick Insights", "Brzi pregled", "Rýchly prehľad")}</h2>
      {loading ? (
        <div className="mt-4 space-y-4">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          <section>
            <h3 className="mb-3 text-sm font-semibold">{L("Assignments by Status", "Angažmani po statusu", "Pridelenia podľa stavu")}</h3>
            <StatusDonut breakdown={breakdown} activeStatus={filters.status}
              onPick={(status) => onFilter(insightFilterPatch("status", status, filters))} />
          </section>

          <section className="border-t pt-4">
            <ProjectBars items={projects} activeProject={filters.project}
              onPick={(projectId) => onFilter(insightFilterPatch("project", projectId, filters))} />
          </section>

          <section className="space-y-3">
            <InsightRow icon={Users} title={L("Workers Available for Reassignment", "Slobodni radnici za preraspodelu", "Voľní pracovníci na presun")}
              value={dash(available)} to={available.to}
              hint={available.error
                ? L("Workforce data isn't available", "Podaci o rasporedu nisu dostupni", "Údaje o rozpise nie sú dostupné")
                : L(`Free on ${short(available.date)} · ${available.shiftLabel}`, `Slobodni ${short(available.date)} · ${available.shiftLabel}`, `Voľní ${short(available.date)} · ${available.shiftLabel}`)}
              ariaLabel={L("Open Workforce Planning with available workers", "Otvori Workforce Planning sa slobodnim radnicima", "Otvoriť plánovanie s voľnými pracovníkmi")}>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 pl-[3.6rem]">
                <Input type="date" value={available.date} onChange={(e) => e.target.value && available.onDate(e.target.value)} className="h-8 bg-card text-xs"
                  aria-label={L("Day", "Dan", "Deň")} />
                <Select value={available.shiftId || WHOLE_DAY} onValueChange={(v) => available.onShift(v === WHOLE_DAY ? "" : v)}>
                  <SelectTrigger className="h-8 bg-card text-xs" aria-label={L("Shift", "Smena", "Zmena")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={WHOLE_DAY}>{L("Whole day", "Ceo dan", "Celý deň")}</SelectItem>
                    {available.shifts.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{`${s.code} · ${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </InsightRow>

            <InsightRow icon={CalendarClock} tone="warning" title={L("Assignments Ending Soon", "Angažmani koji uskoro ističu", "Pridelenia čoskoro končiace")}
              value={endingSoonCount} hint={L("Active, ending within 30 days", "Aktivni, ističu u narednih 30 dana", "Aktívne, končia do 30 dní")}
              onClick={() => onFilter(insightFilterPatch("ending_soon", null, filters))}
              ariaLabel={L("Show assignments ending within 30 days", "Prikaži angažmane koji ističu u 30 dana", "Zobraziť pridelenia končiace do 30 dní")} />

            <InsightRow icon={AlertTriangle} tone={shortages.count > 0 ? "danger" : "primary"} title={L("Workforce Shortages", "Manjak radne snage", "Nedostatok pracovnej sily")}
              value={dash(shortages)} to={shortages.to}
              hint={shortages.error
                ? L("Workforce data isn't available", "Podaci o rasporedu nisu dostupni", "Údaje o rozpise nie sú dostupné")
                : L(`Projects short by role and shift · ${short(shortages.from)} – ${short(shortages.toDate)}`,
                    `Projekti sa manjkom po ulozi i smeni · ${short(shortages.from)} – ${short(shortages.toDate)}`,
                    `Projekty s nedostatkom podľa roly a zmeny · ${short(shortages.from)} – ${short(shortages.toDate)}`)}
              ariaLabel={L("Open Workforce Planning with shortages", "Otvori Workforce Planning sa manjkovima", "Otvoriť plánovanie s nedostatkami")} />
          </section>
        </div>
      )}
    </Card>
  );
}
