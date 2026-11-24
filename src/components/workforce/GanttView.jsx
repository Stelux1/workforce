// Gantt prikaz radne snage (spec §13): dan (satna osa), nedelja i mesec; grupisano po projektu i Job Role-u.
// Red uloge pokazuje potrebu i pokrivenost (manjak crveno, višak zeleno); redovi radnika statuse iz `ganttCell`.
// Klik na dan uloge ili na ćeliju radnika otvara detalj (ko pokriva, ko fali, ko je slobodan).
import { Fragment, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { useLang } from "@/lib/LanguageContext";
import { useL } from "@/lib/translations";
import { formatDate } from "@/lib/dateFormat";
import { buildGantt, dayBars, employeeName } from "@/lib/workforceUi";
import { GANTT_STATUSES, eachDay } from "@/lib/workforce";
import { STATUS_LETTER, STATUS_STYLE, shiftTitle, useStatusLabel } from "./common";

const toDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function GanttLegend() {
  const label = useStatusLabel();
  const L = useL();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label={L("Legend", "Legenda", "Legenda")}>
      {GANTT_STATUSES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-3.5 w-3.5 rounded ${STATUS_STYLE[s]}`} />
          {label(s)}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-3.5 rounded bg-destructive/15 border border-destructive/40" />
        {L("Shortage", "Manjak", "Nedostatok")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-3.5 rounded bg-success-soft border border-success/40" />
        {L("Surplus", "Višak", "Prebytok")}
      </span>
    </div>
  );
}

function SummaryCell({ cell, view, onSelect, title }) {
  const L = useL();
  if (!cell.required && !cell.planned) {
    return <td className="border-l border-border/60 bg-muted/30" />;
  }
  const deficit = cell.deficit > 0;
  const surplus = cell.surplus > 0;
  const tone = deficit
    ? "bg-destructive/15 text-destructive font-semibold"
    : surplus
      ? "bg-success-soft text-success font-medium"
      : "text-muted-foreground";
  const text = deficit ? `−${cell.deficit}` : surplus ? `+${cell.surplus}` : "✓";
  return (
    <td className="border-l border-border/60 p-0">
      <button
        type="button"
        onClick={onSelect}
        title={`${title} — ${L("Required", "Potrebno", "Potrebné")} ${cell.required} · ${L("Available", "Dostupno", "Dostupné")} ${cell.available}`}
        data-testid={deficit ? "gantt-deficit-cell" : undefined}
        className={`h-8 w-full text-xs hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tone}`}
      >
        {view === "month" ? text : `${text} · ${cell.available}/${cell.required}`}
      </button>
    </td>
  );
}

export default function GanttView({ view, from, to, data, projectId, onSelect, compact = false }) {
  const L = useL();
  const { lang } = useLang();
  const label = useStatusLabel();
  const { projects, roles, assignments, schedules, leaves, shifts, employees, requirements, coverageRows } = data;

  const groups = useMemo(
    () => buildGantt({ projects, roles, assignments, schedules, leaves, shifts, employees, requirements, coverageRows, from, to, projectId }),
    [projects, roles, assignments, schedules, leaves, shifts, employees, requirements, coverageRows, from, to, projectId]
  );
  const shiftsById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);

  if (!groups.length) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground" data-testid="gantt-empty">
        {L(
          "Nothing to show in this period. Add Job Roles and assignments to the project, or define the required workforce.",
          "Za ovaj period nema šta da se prikaže. Dodajte Job Role-ove i angažmane projektu ili zadajte potreban broj radnika.",
          "Pre toto obdobie nie je čo zobraziť. Pridajte projektu Job Role a pridelenia alebo zadajte potrebný počet pracovníkov."
        )}
      </div>
    );
  }

  const days = eachDay(from, to);
  const isDay = view === "day";
  const dayWidth = view === "week" ? "min-w-[92px]" : "min-w-[30px]";
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const dayLabel = (iso) => formatDate(toDate(iso), view === "week" ? "EEE d. MMM" : "d", lang);
  const weekdayLetter = (iso) => formatDate(toDate(iso), "EEEEE", lang);
  const isWeekend = (iso) => [0, 6].includes(toDate(iso).getDay());
  const fullDate = (iso) => formatDate(toDate(iso), "EEEE d. MMMM yyyy", lang);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border bg-card shadow-card" data-testid="gantt">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky left-0 z-20 min-w-[220px] bg-muted px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {L("Project / Job Role / Worker", "Projekat / Job Role / Radnik", "Projekt / Job Role / Pracovník")}
              </th>
              {isDay
                ? hours.map((h) => (
                    <th key={h} className="min-w-[34px] border-l border-border/60 px-0 py-2 text-center text-[11px] font-normal text-muted-foreground">
                      {String(h).padStart(2, "0")}
                    </th>
                  ))
                : days.map((d) => (
                    <th
                      key={d}
                      scope="col"
                      className={`${dayWidth} border-l border-border/60 px-1 py-1 text-center text-xs font-medium ${isWeekend(d) ? "text-muted-foreground" : ""}`}
                    >
                      {view === "month" && <div className="text-[10px] font-normal uppercase text-muted-foreground">{weekdayLetter(d)}</div>}
                      {dayLabel(d)}
                    </th>
                  ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(({ project, roles: roleBlocks }) => (
              <Fragment key={project.id}>
                {!projectId && (
                  <tr className="bg-secondary/60">
                    <td colSpan={1 + (isDay ? 24 : days.length)} className="sticky left-0 px-3 py-1.5 text-xs font-semibold text-secondary-foreground">
                      <span className="inline-flex items-center gap-1.5"><ChevronDown className="h-3.5 w-3.5" />{project.name}</span>
                    </td>
                  </tr>
                )}
                {roleBlocks.length === 0 && (
                  <tr>
                    <td colSpan={1 + (isDay ? 24 : days.length)} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {L("This project has no Job Roles with a workforce requirement or assignments in this period.", "Projekat nema Job Role-ove sa potrebom ili angažmanima u ovom periodu.", "Projekt nemá Job Role s požiadavkou alebo pridelenia v tomto období.")}
                    </td>
                  </tr>
                )}
                {roleBlocks.map(({ role, summary, workers }) => (
                  <Fragment key={role.id}>
                    <tr className="border-t bg-muted/20">
                      <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left text-sm font-semibold">
                        {role.title}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {workers.length} {L("assigned", "angažovano", "pridelených")}
                        </span>
                      </th>
                      {isDay ? (
                        <td colSpan={24} className="border-l border-border/60 px-2 py-1">
                          {summary[0]?.shifts?.length ? (
                            <div className="flex flex-wrap gap-2">
                              {summary[0].shifts.map((s) => (
                                <button
                                  key={s.shiftId}
                                  type="button"
                                  onClick={() => onSelect({ projectId: project.id, projectRoleId: role.id, date: s.date })}
                                  data-testid={s.deficit > 0 ? "gantt-deficit-cell" : undefined}
                                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium hover:ring-2 hover:ring-primary/40 ${
                                    s.deficit > 0 ? "bg-destructive/15 text-destructive" : s.surplus > 0 ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {shiftTitle(shiftsById.get(s.shiftId))}: {s.available}/{s.required}
                                  {s.deficit > 0 ? ` · ${L("shortage", "manjak", "nedostatok")} ${s.deficit}` : s.surplus > 0 ? ` · ${L("surplus", "višak", "prebytok")} ${s.surplus}` : ""}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{L("No requirement defined for this day", "Za ovaj dan nije zadat potreban broj", "Pre tento deň nie je zadaný potrebný počet")}</span>
                          )}
                        </td>
                      ) : (
                        summary.map((cell) => (
                          <SummaryCell
                            key={cell.date}
                            cell={cell}
                            view={view}
                            title={`${role.title}, ${fullDate(cell.date)}`}
                            onSelect={() => onSelect({ projectId: project.id, projectRoleId: role.id, date: cell.date })}
                          />
                        ))
                      )}
                    </tr>
                    {workers.map(({ assignment, employee, cells }) => {
                      const name = employeeName(employee);
                      return (
                        <tr key={assignment.id} className="border-t border-border/50">
                          <th scope="row" className="sticky left-0 z-10 bg-card py-1 pl-7 pr-3 text-left text-sm font-normal">
                            <span className="block truncate max-w-[200px]" title={name}>{name}</span>
                          </th>
                          {isDay ? (
                            <td colSpan={24} className="relative h-8 border-l border-border/60 p-0">
                              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: "repeat(24, 1fr)" }} aria-hidden>
                                {hours.map((h) => <div key={h} className="border-l border-border/40 first:border-l-0" />)}
                              </div>
                              {dayBars({ date: from, assignment, projectId: project.id, schedules, leaves, shifts }).map((bar, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => onSelect({ projectId: project.id, projectRoleId: role.id, date: from })}
                                  title={`${name} — ${label(bar.status)}`}
                                  aria-label={`${name}, ${label(bar.status)}`}
                                  className={`absolute top-1 bottom-1 rounded px-1 text-left text-[11px] leading-6 truncate hover:ring-2 hover:ring-primary/40 ${STATUS_STYLE[bar.status] || STATUS_STYLE.assigned}`}
                                  style={{ left: `${(bar.startH / 24) * 100}%`, width: `${((bar.endH - bar.startH) / 24) * 100}%` }}
                                >
                                  {label(bar.status)}
                                </button>
                              ))}
                            </td>
                          ) : (
                            cells.map((cell) => (
                              <td key={cell.date} className="border-l border-border/40 p-0.5">
                                {cell.status ? (
                                  <button
                                    type="button"
                                    onClick={() => onSelect({ projectId: project.id, projectRoleId: role.id, date: cell.date })}
                                    title={`${name} — ${label(cell.status)}, ${fullDate(cell.date)}`}
                                    aria-label={`${name}, ${fullDate(cell.date)}: ${label(cell.status)}`}
                                    data-status={cell.status}
                                    className={`h-6 w-full rounded text-[10px] font-semibold hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${STATUS_STYLE[cell.status]}`}
                                  >
                                    {view === "week" ? label(cell.status) : STATUS_LETTER[cell.status]}
                                  </button>
                                ) : (
                                  <div className="h-6 rounded bg-muted/40" aria-hidden />
                                )}
                              </td>
                            ))
                          )}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && <GanttLegend />}
    </div>
  );
}
