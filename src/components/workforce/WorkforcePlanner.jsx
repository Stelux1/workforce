// Workforce Planning (spec §13): Gantt (dan/nedelja/mesec), Required Workforce, Coverage i detalj dana.
// Koristi se na stranici /workforce (svi projekti) i na kartici Workforce Plan projekta (`projectId` zaključan).
// Prava: čitanje svi koji vide projekat (RLS); izmene samo `workforce.manage` (dugmad se sklanjaju, baza odbija).
import { useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Clock, Plus, ShieldOff, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EmptyState from "@/components/shared/EmptyState";
import { useAuth } from "@/lib/AuthContext";
import { useLang } from "@/lib/LanguageContext";
import { useL } from "@/lib/translations";
import { formatDate, formatIsoDate } from "@/lib/dateFormat";
import { VIEWS, coverageTotals, employeeName, moveAnchor, roleIdsForKey, viewRange, workforceStartState } from "@/lib/workforceUi";
import { availableWorkers } from "@/lib/workforce";
import CoverageDetail from "./CoverageDetail";
import CoverageTable from "./CoverageTable";
import GanttView from "./GanttView";
import RequirementDialog from "./RequirementDialog";
import RequirementsTable from "./RequirementsTable";
import ShiftsDialog from "./ShiftsDialog";
import { ErrorNote } from "./common";
import { useWorkforceData } from "./useWorkforceData";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const toDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const ALL = "__all__";

function Kpi({ label, value, tone, testid }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-card" data-testid={testid}>
      <div className={`text-2xl font-semibold tabular-nums ${tone || ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// Početno stanje iz adrese (listLinks.js): view=available|shortages, date, from/to, role, shift — vidi workforceStartState.
export default function WorkforcePlanner({ projectId: lockedProject = null, initialProject = "", initialFrom = "", initialTo = "", initialClient = "", initialPstatus = "",
  initialView = "", initialDate = "", initialRole = "", initialShift = "" }) {
  const L = useL();
  const { lang } = useLang();
  const { can } = useAuth();
  const canManage = !!can?.("workforce.manage");

  const [projectFilter, setProjectFilter] = useState(initialProject || ALL);
  const projectId = lockedProject || (projectFilter === ALL ? null : projectFilter);
  const start = useMemo(() => workforceStartState({ view: initialView, date: initialDate, from: initialFrom, to: initialTo, today: todayIso() }), []);
  const [view, setView] = useState(start.view);
  const [anchor, setAnchor] = useState(start.anchor);
  const [tab, setTab] = useState(start.tab);
  const [roleKey, setRoleKey] = useState(initialRole || "");
  const [availableAsk, setAvailableAsk] = useState(start.availableDate ? { date: start.availableDate, shiftId: initialShift || null } : null);
  const [selection, setSelection] = useState(null);
  const [reqDialog, setReqDialog] = useState(null); // { requirement?, defaults? }
  const [shiftsOpen, setShiftsOpen] = useState(false);

  const { from, to } = useMemo(() => viewRange(view, anchor), [view, anchor]);
  const raw = useWorkforceData({ from, to, projectId });
  // Filteri iz adrese (client, pstatus): sužavaju projekte i njihovu pokrivenost.
  // Filter Job Role iz adrese (role = title_key): sužava potrebe i pokrivenost na uloge tog naziva.
  const data = useMemo(() => {
    const roleIds = roleIdsForKey(raw.roles, roleKey);
    if (!initialClient && !initialPstatus && !roleIds) return raw;
    const projects = raw.projects.filter((p) => (!initialClient || p.client_id === initialClient) && (!initialPstatus || p.status === initialPstatus));
    const ids = new Set(projects.map((p) => p.id));
    const keep = (projectIdOf, roleIdOf) => (x) => ids.has(projectIdOf(x)) && (!roleIds || roleIds.has(roleIdOf(x)));
    return {
      ...raw, projects,
      coverageRows: raw.coverageRows.filter(keep((r) => r.projectId, (r) => r.projectRoleId)),
      requirements: raw.requirements.filter(keep((q) => q.project_id, (q) => q.project_role_id)),
    };
  }, [raw, initialClient, initialPstatus, roleKey]);
  // „Available workers" (Project Assignments Quick Insights): isti izračun kao kartica — availableWorkers (workforce.js).
  const available = useMemo(() => {
    if (!availableAsk || raw.isLoading) return null;
    return availableWorkers({
      date: availableAsk.date, shiftId: availableAsk.shiftId, roleKey: roleKey || null,
      employees: raw.employees.filter((e) => e.status === "active"), assignments: raw.assignments,
      schedules: raw.schedules, leaves: raw.leaves, shifts: raw.shifts, projectRoles: raw.roles,
    });
  }, [availableAsk, raw, roleKey]);
  const roleLabel = roleKey ? raw.roles.find((r) => String(r.title_key ?? r.title ?? "").trim().toLowerCase() === roleKey.toLowerCase())?.title || roleKey : "";
  const totals = useMemo(() => coverageTotals(data.coverageRows), [data.coverageRows]);

  const rangeLabel =
    view === "day"
      ? formatDate(toDate(from), "EEEE d. MMMM yyyy", lang)
      : view === "week"
        ? `${formatDate(toDate(from), "d. MMM", lang)} – ${formatDate(toDate(to), "d. MMM yyyy", lang)}`
        : formatDate(toDate(from), "LLLL yyyy", lang);
  const viewLabel = { day: L("Day", "Dan", "Deň"), week: L("Week", "Nedelja", "Týždeň"), month: L("Month", "Mesec", "Mesiac") };
  const projectShifts = data.shifts.filter((s) => s.active !== false && (!projectId || !s.project_id || s.project_id === projectId));
  const visibleProjects = lockedProject ? data.projects.filter((p) => p.id === lockedProject) : data.projects;

  if (data.isLoading) {
    return (
      <div className="space-y-4" data-testid="workforce-loading" aria-busy="true">
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  if (data.error) {
    const denied = data.error?.code === "42501" || /permission denied|row-level security/i.test(String(data.error?.message || ""));
    return denied ? (
      <div role="alert" className="flex flex-col items-center py-12 text-center" data-testid="workforce-denied">
        <ShieldOff className="h-8 w-8 text-warning mb-2" />
        <p className="font-semibold">{L("You don't have access to the workforce plan", "Nemate pristup planu radne snage", "Nemáte prístup k plánu pracovnej sily")}</p>
        <p className="text-sm text-muted-foreground max-w-md mt-1">{L("Ask an administrator to change your role or project access in Settings → Users.", "Zamolite administratora da vam promeni ulogu ili pristup projektima u Podešavanja → Korisnici.", "Požiadajte administrátora o zmenu roly alebo prístupu k projektom v Nastavenia → Používatelia.")}</p>
      </div>
    ) : (
      <ErrorNote error={data.error} onRetry={data.refetch} />
    );
  }
  if (!visibleProjects.length) {
    return (
      <div className="rounded-xl border bg-card shadow-card">
        <EmptyState
          icon={CalendarClock}
          title={L("No projects to plan", "Nema projekata za planiranje", "Žiadne projekty na plánovanie")}
          description={L("Workforce planning works per project. Create a project (or ask for access to one) first.", "Planiranje radne snage ide po projektima. Prvo napravite projekat (ili zatražite pristup nekom).", "Plánovanie pracovnej sily funguje podľa projektov. Najprv vytvorte projekt (alebo požiadajte o prístup).")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="workforce-planner">
      <div className="flex flex-wrap items-center gap-2">
        {!lockedProject && (
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-56" aria-label={L("Project", "Projekat", "Projekt")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{L("All projects", "Svi projekti", "Všetky projekty")}</SelectItem>
              {data.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label={L("View", "Prikaz", "Zobrazenie")}>
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {viewLabel[v]}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label={L("Previous", "Prethodni", "Predchádzajúci")} onClick={() => setAnchor((a) => moveAnchor(view, a, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(todayIso())}>{L("Today", "Danas", "Dnes")}</Button>
          <Button variant="outline" size="icon" aria-label={L("Next", "Sledeći", "Nasledujúci")} onClick={() => setAnchor((a) => moveAnchor(view, a, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <span className="text-sm font-medium" data-testid="range-label">{rangeLabel.charAt(0).toUpperCase() + rangeLabel.slice(1)}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShiftsOpen(true)}><Clock className="h-4 w-4" />{L("Shifts", "Smene", "Zmeny")}</Button>
          {canManage && (
            <Button size="sm" className="gap-1.5" onClick={() => setReqDialog({})} disabled={projectShifts.length === 0} title={projectShifts.length === 0 ? L("Define a shift first", "Prvo definišite smenu", "Najprv definujte zmenu") : undefined}>
              <Plus className="h-4 w-4" />{L("Required workforce", "Potreban broj radnika", "Potrebný počet")}
            </Button>
          )}
        </div>
      </div>

      {roleKey && (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="role-filter">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-accent-foreground">
            {L("Job Role", "Job Role", "Pracovná rola")}: {roleLabel}
            <button type="button" className="ml-0.5 rounded-full hover:text-foreground" aria-label={L("Clear Job Role filter", "Ukloni filter Job Role", "Zrušiť filter roly")} onClick={() => setRoleKey("")}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}

      {availableAsk && available && (
        <section className="rounded-xl border bg-card p-4 shadow-card" data-testid="available-workers">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <UserCheck className="h-4 w-4 text-success" />
              {L("Available workers", "Slobodni radnici", "Voľní pracovníci")} · {formatIsoDate(availableAsk.date, lang)}
              {availableAsk.shiftId && ` · ${raw.shifts.find((x) => x.id === availableAsk.shiftId)?.name || ""}`}
              {roleLabel && ` · ${roleLabel}`}
              <span className="ml-1 rounded-full bg-success-soft px-2 py-0.5 text-xs text-success tabular-nums">{available.length}</span>
            </h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={L("Close", "Zatvori", "Zavrieť")} onClick={() => setAvailableAsk(null)}><X className="h-4 w-4" /></Button>
          </div>
          {available.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{L("Nobody is free for this day and shift.", "Niko nije slobodan za ovaj dan i smenu.", "Na tento deň a zmenu nie je nikto voľný.")}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {available.slice(0, 60).map((w) => {
                const e = raw.employees.find((x) => x.id === w.employeeId);
                return (
                  <li key={w.employeeId} className={`rounded-full px-2.5 py-0.5 text-xs ${w.standby ? "bg-warning-soft text-warning" : "bg-muted text-foreground"}`}>
                    {employeeName(e)}{w.standby ? ` · ${L("standby", "pripravnost", "pohotovosť")}` : ""}
                  </li>
                );
              })}
              {available.length > 60 && <li className="px-2 py-0.5 text-xs text-muted-foreground">+{available.length - 60}</li>}
            </ul>
          )}
        </section>
      )}

      {!canManage && (
        <p className="text-xs text-muted-foreground" data-testid="view-only">{L("View only — your role cannot change the workforce plan.", "Samo pregled — vaša uloga ne može da menja plan radne snage.", "Len na zobrazenie — vaša rola nemôže meniť plán pracovnej sily.")}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={L("Required (worker-shifts)", "Potrebno (radnik-smena)", "Potrebné (pracovník-zmena)")} value={totals.required} testid="kpi-required" />
        <Kpi label={L("Available", "Dostupno", "Dostupné")} value={totals.available} testid="kpi-available" />
        <Kpi label={L("Shortage", "Manjak", "Nedostatok")} value={totals.deficit} tone={totals.deficit > 0 ? "text-destructive" : ""} testid="kpi-deficit" />
        <Kpi label={L("Projects with shortage", "Projekata sa manjkom", "Projekty s nedostatkom")} value={totals.shortageProjects} tone={totals.shortageProjects > 0 ? "text-destructive" : ""} testid="kpi-shortage-projects" />
      </div>

      {projectShifts.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card p-4 text-sm" data-testid="no-shifts">
          <p className="font-medium">{L("No shifts are defined yet", "Još nema definisanih smena", "Zatiaľ nie sú definované žiadne zmeny")}</p>
          <p className="text-muted-foreground mt-0.5">
            {canManage
              ? L("Required workforce is set per shift. Add shifts first.", "Potreban broj radnika se zadaje po smeni. Prvo dodajte smene.", "Potrebný počet pracovníkov sa zadáva podľa zmeny. Najprv pridajte zmeny.")
              : L("Ask someone with workforce permission to define shifts.", "Zamolite nekoga sa pravom nad radnom snagom da definiše smene.", "Požiadajte niekoho s oprávnením k pracovnej sile, aby definoval zmeny.")}
          </p>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="gantt">Gantt</TabsTrigger>
          <TabsTrigger value="requirements">{L("Requirements", "Zahtevi", "Požiadavky")}</TabsTrigger>
          <TabsTrigger value="coverage">{L("Coverage", "Pokrivenost", "Pokrytie")}</TabsTrigger>
        </TabsList>
        <TabsContent value="gantt" className="mt-4">
          <GanttView view={view} from={from} to={to} data={data} projectId={projectId} onSelect={setSelection} />
        </TabsContent>
        <TabsContent value="requirements" className="mt-4">
          <RequirementsTable
            data={data} from={from} to={to} projectId={projectId} canManage={canManage}
            onAdd={() => setReqDialog({})} onEdit={(requirement) => setReqDialog({ requirement })} onChanged={data.refetch}
          />
        </TabsContent>
        <TabsContent value="coverage" className="mt-4">
          <CoverageTable data={data} projectId={projectId} onSelect={setSelection} initialFilter={start.coverageFilter} />
        </TabsContent>
      </Tabs>

      <CoverageDetail
        selection={selection}
        data={data}
        canManage={canManage}
        onClose={() => setSelection(null)}
        onAddRequirement={(defaults) => { setSelection(null); setReqDialog({ defaults }); }}
      />
      <RequirementDialog
        open={!!reqDialog}
        onClose={() => setReqDialog(null)}
        projects={visibleProjects}
        roles={data.roles}
        shifts={data.shifts}
        requirements={data.requirements}
        projectId={projectId}
        requirement={reqDialog?.requirement || null}
        defaults={reqDialog?.defaults}
        onSaved={data.refetch}
      />
      <ShiftsDialog open={shiftsOpen} onClose={() => setShiftsOpen(false)} shifts={data.shifts} projects={visibleProjects} projectId={projectId} canManage={canManage} onChanged={data.refetch} />
    </div>
  );
}
