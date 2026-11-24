// Project Assignments (spec §4, W2-K) — /assignments. Faza A1 (pregled) i A2 (upravljanje) na istoj strani.
// Jedan skup redova za sve: decorateAssignments → filterAssignments → sortAssignments (src/lib/assignments.js), pa
// tabela, KPI kartice, Quick Insights i izvoz uvek imaju isti obuhvat, isti referentni dan i ista prava (T02).
// Filteri žive u URL-u (?status=ending_soon&project=…), pa KPI i linkovi sa drugih ekrana otvaraju realnu listu (T04).
// Kartica „Rate History" (?tab=rates) je bivša stranica /rates (redirect).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Link2, SearchX, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmptyState from "@/components/shared/EmptyState";
import { useAuth } from "@/lib/AuthContext";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { pageTitle } from "@/lib/pageTitles";
import {
  DEFAULT_TIME_ZONE, SORT_KEYS, addDays, assignmentKpis, byProject, decorateAssignments, endingSoon, filterAssignments,
  sortAssignments, statusBreakdown, todayInZone,
} from "@/lib/assignments";
import { availableWorkers, coverage, shortageProjects } from "@/lib/workforce";
import AssignmentKpis from "@/components/assignments/AssignmentKpis";
import AssignmentFilters from "@/components/assignments/AssignmentFilters";
import AssignmentsTable, { PAGE_SIZES } from "@/components/assignments/AssignmentsTable";
import QuickInsights from "@/components/assignments/QuickInsights";
import AssignmentDetailDrawer from "@/components/assignments/AssignmentDetailDrawer";
import AddAssignmentDialog from "@/components/assignments/AddAssignmentDialog";
import EditAssignmentDialog from "@/components/assignments/EditAssignmentDialog";
import ReassignDialog from "@/components/assignments/ReassignDialog";
import EndAssignmentDialog from "@/components/assignments/EndAssignmentDialog";
import AssignmentExport from "@/components/assignments/AssignmentExport";
import { useAssignmentStatusLabels } from "@/components/assignments/status";
import RateHistory from "@/pages/rates/RatesPage";

// Isti nazivi kao ugovor src/lib/listLinks.js (from, to, project, client, status, pstatus) + lokalni filteri ekrana.
const FILTER_KEYS = ["q", "project", "client", "pstatus", "role", "status", "from", "to", "mode", "expiring"];
const SHORTAGE_DAYS = 30;

export default function ProjectAssignmentsPage() {
  const L = useL();
  const { lang } = useLang();
  const { can, permissions } = useAuth();
  const statusLabels = useAssignmentStatusLabels();
  const [params, setParams] = useSearchParams();

  const canManage = Boolean(can?.("assignments.manage"));
  const seeB2C = Boolean(can?.("rates.view_b2c"));
  const seeB2B = Boolean(can?.("rates.view_b2b"));
  const seeRateHistory = seeB2B || seeB2C || Boolean(can?.("rates.manage"));
  const access = { canManage, seeB2C, seeB2B };

  // ── URL stanje ──
  const tab = params.get("tab") === "rates" && seeRateHistory ? "rates" : "assignments";
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ""]));
  // Bez izričitog režima: sa periodom (Date Range, npr. link sa Dashboarda ?from=&to=) prikazuju se svi angažmani koji se
  // preklapaju sa periodom, inače brzi režim Active (§4.1).
  filters.mode = filters.mode === "all" || filters.mode === "active" ? filters.mode : filters.from || filters.to ? "all" : "active";
  const sortKey = SORT_KEYS.includes(params.get("sort")) ? params.get("sort") : "employee";
  const sort = { key: sortKey, dir: params.get("dir") === "desc" ? "desc" : "asc" };
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = PAGE_SIZES.includes(Number(params.get("size"))) ? Number(params.get("size")) : 10;

  const patchParams = useCallback((patch, { keepPage = false } = {}) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === "" || v === null || v === undefined) next.delete(k);
        else next.set(k, String(v));
      }
      if (!keepPage) next.delete("page");
      return next;
    }, { replace: true });
  }, [setParams]);
  const onFilter = useCallback((patch) => patchParams(patch), [patchParams]);
  const clearFilters = () => patchParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])));

  // ── podaci ──
  const assignmentsQ = useQuery({ queryKey: ["project-assignments"], queryFn: () => base44.entities.ProjectAssignment.list("-start_date") });
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list("name") });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => base44.entities.Client.list("name") });
  const employeesQ = useQuery({ queryKey: ["employees"], queryFn: () => base44.entities.Employee.list("last_name") });
  const ratesQ = useQuery({ queryKey: ["rates"], queryFn: () => base44.entities.Rate.list("-effective_from"), enabled: seeB2B || seeB2C });
  const { data: projectRoles = [] } = useQuery({ queryKey: ["project-roles", "all"], queryFn: () => base44.entities.ProjectRole.list("sort") });
  const { data: shifts = [] } = useQuery({ queryKey: ["shifts"], queryFn: () => base44.entities.Shift.list("sort", 500) });
  const { data: history = [] } = useQuery({
    queryKey: ["employment-history-all"],
    queryFn: () => base44.entities.EmploymentHistory.list("-start_date", 500),
    enabled: canManage,
  });
  const { data: companyZone = DEFAULT_TIME_ZONE } = useQuery({
    queryKey: ["app-settings", "time_zone"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("time_zone").eq("id", true).maybeSingle();
      if (error) throw error;
      return data?.time_zone || DEFAULT_TIME_ZONE;
    },
    staleTime: 10 * 60 * 1000,
  });

  const companyToday = todayInZone(companyZone);
  const projects = useMemo(() => projectsQ.data || [], [projectsQ.data]);
  const employees = useMemo(() => employeesQ.data || [], [employeesQ.data]);
  const rawAssignments = useMemo(() => assignmentsQ.data || [], [assignmentsQ.data]);

  const decorated = useMemo(
    () => decorateAssignments(rawAssignments, { projects, employees, rates: ratesQ.data || [], perms: permissions || [], defaultTimeZone: companyZone }),
    [rawAssignments, projects, employees, ratesQ.data, permissions, companyZone]
  );
  const filtered = useMemo(
    () => filterAssignments(decorated, { search: filters.q, projectId: filters.project, clientId: filters.client, projectStatus: filters.pstatus, roleKey: filters.role,
      status: filters.status, from: filters.from, to: filters.to, mode: filters.mode, expiring: filters.expiring }),
    [decorated, filters.q, filters.project, filters.client, filters.pstatus, filters.role, filters.status, filters.from, filters.to, filters.mode, filters.expiring]
  );
  const sorted = useMemo(() => sortAssignments(filtered, sort), [filtered, sort.key, sort.dir]);
  const kpis = useMemo(
    () => assignmentKpis(filtered, { today: companyToday, period: filters.from || filters.to ? { from: filters.from, to: filters.to } : null }),
    [filtered, companyToday, filters.from, filters.to]
  );
  const breakdown = useMemo(() => statusBreakdown(filtered), [filtered]);
  const perProject = useMemo(() => byProject(filtered), [filtered]);
  const endingSoonCount = useMemo(() => endingSoon(filtered).length, [filtered]);

  // ── Workforce: slobodni radnici (dan/smena) i manjak u periodu ──
  const [availDate, setAvailDate] = useState(null);
  const [availShift, setAvailShift] = useState("");
  const availableDay = availDate || companyToday;
  const shortFrom = filters.from || (filters.to && filters.to < companyToday ? filters.to : companyToday);
  const shortTo = filters.to || addDays(shortFrom, SHORTAGE_DAYS);
  const schedFrom = [addDays(availableDay, -1), shortFrom].sort()[0];
  const schedTo = [addDays(availableDay, 1), shortTo].sort()[1];
  const schedulesQ = useQuery({
    queryKey: ["schedules", "assignments-insights", schedFrom, schedTo],
    queryFn: () => base44.entities.Schedule.filter({ date: { $gte: schedFrom, $lte: schedTo } }),
  });
  const leavesQ = useQuery({ queryKey: ["leave-requests", "approved"], queryFn: () => base44.entities.LeaveRequest.filter({ status: "approved" }) });
  const requirementsQ = useQuery({ queryKey: ["workforce-requirements"], queryFn: () => base44.entities.WorkforceRequirement.list() });

  const rolesById = useMemo(() => new Map(projectRoles.map((r) => [r.id, r])), [projectRoles]);
  const projectsInScope = useMemo(() => {
    const set = new Set(projects.filter((p) => (!filters.client || p.client_id === filters.client) && (!filters.project || p.id === filters.project)
      && (!filters.pstatus || p.status === filters.pstatus)).map((p) => p.id));
    return set;
  }, [projects, filters.client, filters.project, filters.pstatus]);

  const available = useMemo(() => {
    if (schedulesQ.isLoading || leavesQ.isLoading || employeesQ.isLoading || assignmentsQ.isLoading) return { loading: true };
    if (schedulesQ.isError || leavesQ.isError) return { error: true };
    const list = availableWorkers({
      date: availableDay, shiftId: availShift || null, roleKey: filters.role || null,
      employees: employees.filter((e) => e.status === "active"), assignments: rawAssignments,
      schedules: schedulesQ.data || [], leaves: leavesQ.data || [], shifts, projectRoles,
    });
    return { count: list.length };
  }, [schedulesQ.isLoading, schedulesQ.isError, schedulesQ.data, leavesQ.isLoading, leavesQ.isError, leavesQ.data, employeesQ.isLoading,
    assignmentsQ.isLoading, availableDay, availShift, filters.role, employees, rawAssignments, shifts, projectRoles]);

  const shortages = useMemo(() => {
    if (schedulesQ.isLoading || leavesQ.isLoading || requirementsQ.isLoading || assignmentsQ.isLoading) return { loading: true };
    if (schedulesQ.isError || leavesQ.isError || requirementsQ.isError) return { error: true };
    const reqs = (requirementsQ.data || []).filter((r) => projectsInScope.has(r.project_id)
      && (!filters.role || String(rolesById.get(r.project_role_id)?.title_key || "") === filters.role));
    const rows = coverage({ requirements: reqs, assignments: rawAssignments, schedules: schedulesQ.data || [], leaves: leavesQ.data || [], shifts, from: shortFrom, to: shortTo });
    return { count: shortageProjects(rows) };
  }, [schedulesQ.isLoading, schedulesQ.isError, schedulesQ.data, leavesQ.isLoading, leavesQ.isError, leavesQ.data, requirementsQ.isLoading,
    requirementsQ.isError, requirementsQ.data, assignmentsQ.isLoading, projectsInScope, filters.role, rolesById, rawAssignments, shifts, shortFrom, shortTo]);

  const workforceLink = (view, extra) => {
    const q = new URLSearchParams({ view, ...extra });
    if (filters.project) q.set("project", filters.project);
    if (filters.role) q.set("role", filters.role);
    return `/workforce?${q.toString()}`;
  };
  const shiftObj = shifts.find((s) => s.id === availShift);

  // ── filter opcije ──
  const roleOptions = useMemo(() => {
    const map = new Map();
    for (const r of projectRoles) if (r.title_key && !map.has(r.title_key)) map.set(r.title_key, r.title);
    for (const a of rawAssignments) {
      const k = String(a.position || "").trim().toLowerCase();
      if (k && !map.has(k)) map.set(k, a.position.trim());
    }
    return [...map].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [projectRoles, rawAssignments]);

  const filterText = useMemo(() => {
    const parts = [];
    parts.push(filters.mode === "active" ? L("Active", "Aktivni", "Aktívne") : L("All assignments", "Svi angažmani", "Všetky pridelenia"));
    if (filters.q) parts.push(`„${filters.q}"`);
    if (filters.project) parts.push(projects.find((p) => p.id === filters.project)?.name || filters.project);
    if (filters.client) parts.push(clients.find((c) => c.id === filters.client)?.name || filters.client);
    if (filters.pstatus) parts.push(L(`project status: ${filters.pstatus}`, `status projekta: ${filters.pstatus}`, `stav projektu: ${filters.pstatus}`));
    if (filters.role) parts.push(roleOptions.find((r) => r.key === filters.role)?.label || filters.role);
    if (filters.status) parts.push(statusLabels[filters.status] || filters.status);
    if (filters.from || filters.to) parts.push(`${filters.from ? formatIsoDate(filters.from, lang) : "…"} – ${filters.to ? formatIsoDate(filters.to, lang) : "…"}`);
    if (filters.expiring) parts.push(L("Expiring this month", "Ističu ovog meseca", "Končia tento mesiac"));
    parts.push(L(`status as of ${formatIsoDate(companyToday, lang)}`, `status na dan ${formatIsoDate(companyToday, lang)}`, `stav k ${formatIsoDate(companyToday, lang)}`));
    return parts.join(" · ");
  }, [filters.mode, filters.q, filters.project, filters.client, filters.pstatus, filters.role, filters.status, filters.from, filters.to, filters.expiring, projects, clients, roleOptions, statusLabels, companyToday, lang, L]);

  // ── dijalozi ──
  const [view, setView] = useState(null);
  // Quick Link „New Assignment" sa Dashboarda: /assignments?action=new (samo uz assignments.manage).
  const [addOpen, setAddOpenState] = useState(false);
  const wantsNew = params.get("action") === "new";
  useEffect(() => {
    if (wantsNew && canManage) setAddOpenState(true);
  }, [wantsNew, canManage]);
  const setAddOpen = (open) => {
    setAddOpenState(open);
    if (!open && params.get("action")) patchParams({ action: "" }, { keepPage: true });
  };
  const [edit, setEdit] = useState(null);
  const [reassign, setReassign] = useState(null); // { assignment, mode }
  const [end, setEnd] = useState(null); // { assignment, mode }
  const viewRow = view ? decorated.find((a) => a.id === view) || null : null;
  const actions = {
    onView: (a) => setView(a.id),
    onEdit: (a) => setEdit(a),
    onTransfer: (a) => setReassign({ assignment: a, mode: "transfer" }),
    onAdditional: (a) => setReassign({ assignment: a, mode: "additional" }),
    onEnd: (a) => setEnd({ assignment: a, mode: "end" }),
    onCancel: (a) => setEnd({ assignment: a, mode: "cancel" }),
  };

  const loading = assignmentsQ.isLoading || projectsQ.isLoading || employeesQ.isLoading || ((seeB2B || seeB2C) && ratesQ.isLoading);
  const hasFilters = FILTER_KEYS.some((k) => k !== "mode" && filters[k]) || params.has("mode");

  const header = (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <Link2 className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{pageTitle("Project Assignments", lang)}</h1>
          <p className="mt-1 text-muted-foreground">
            {L("Manage and track workforce assignments across all projects.", "Upravljajte angažovanjem radnika na svim projektima i pratite ga.", "Spravujte a sledujte pridelenia pracovníkov na všetkých projektoch.")}
          </p>
        </div>
      </div>
      {tab === "assignments" && (
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Users className="h-4 w-4" />
              {L("Add Assignment", "Novi angažman", "Pridať pridelenie")}
            </Button>
          )}
          <AssignmentExport rows={sorted} filterText={filterText} />
        </div>
      )}
    </div>
  );

  const assignmentsView = (
    <div className="space-y-4">
      <AssignmentFilters filters={filters} onChange={onFilter} options={{ projects, clients, roles: roleOptions }} />
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_316px]">
        <div className="min-w-0 space-y-4">
          <AssignmentKpis kpis={kpis} projectCount={perProject.length} loading={loading} onFilter={onFilter} inPeriod={Boolean(filters.from || filters.to)} />
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-3 pt-4">
              <h2 className="text-lg font-semibold">
                {L("Assignments", "Angažmani", "Pridelenia")} <span className="font-normal text-muted-foreground">({filtered.length})</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                {L(`Status as of ${formatIsoDate(companyToday, lang)} in each project's time zone`, `Status na dan ${formatIsoDate(companyToday, lang)} po vremenskoj zoni projekta`, `Stav k ${formatIsoDate(companyToday, lang)} podľa časového pásma projektu`)}
              </p>
            </div>
            {loading ? (
              <div className="space-y-2 px-4 pb-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
            ) : assignmentsQ.isError ? (
              <div className="px-4 pb-6 text-sm text-destructive">{assignmentsQ.error?.message}</div>
            ) : rawAssignments.length === 0 ? (
              <EmptyState icon={Users} title={L("No project assignments yet", "Još nema angažmana na projektima", "Zatiaľ žiadne pridelenia")}
                description={L("Assign employees to projects to see them here, on the project's Workers tab and in planning.",
                  "Dodelite radnike projektima da biste ih videli ovde, na kartici Radnici projekta i u planiranju.",
                  "Priraďte zamestnancov k projektom a uvidíte ich tu, na karte Pracovníci projektu aj v plánovaní.")}
                actionLabel={canManage ? L("Add Assignment", "Novi angažman", "Pridať pridelenie") : undefined}
                onAction={canManage ? () => setAddOpen(true) : undefined} />
            ) : sorted.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-12 text-center">
                <SearchX className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="font-medium">{L("No assignments match the filters", "Nijedan angažman ne odgovara filterima", "Filtrom nevyhovuje žiadne pridelenie")}</p>
                {hasFilters && <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>{L("Clear filters", "Obriši filtere", "Vymazať filtre")}</Button>}
              </div>
            ) : (
              <AssignmentsTable rows={sorted} sort={sort}
                onSort={(key) => patchParams({ sort: key, dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc" }, { keepPage: true })}
                page={page} pageSize={pageSize} onPage={(p) => patchParams({ page: p > 1 ? p : "" }, { keepPage: true })}
                onPageSize={(n) => patchParams({ size: n === 10 ? "" : n })} access={access} actions={actions} />
            )}
          </Card>
        </div>
        <QuickInsights loading={loading} breakdown={breakdown} projects={perProject} endingSoonCount={endingSoonCount}
          filters={filters} onFilter={onFilter}
          available={{
            ...available, date: availableDay, shiftId: availShift, shifts: shifts.filter((s) => s.active),
            shiftLabel: shiftObj ? shiftObj.code : L("whole day", "ceo dan", "celý deň"),
            onDate: setAvailDate, onShift: setAvailShift,
            to: workforceLink("available", { date: availableDay, ...(availShift ? { shift: availShift } : {}) }),
          }}
          shortages={{ ...shortages, from: shortFrom, toDate: shortTo, to: workforceLink("shortages", { from: shortFrom, to: shortTo }) }} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {header}
      {seeRateHistory ? (
        <Tabs value={tab} onValueChange={(v) => patchParams({ tab: v === "rates" ? "rates" : "" }, { keepPage: true })}>
          <TabsList>
            <TabsTrigger value="assignments">{L("Assignments", "Angažmani", "Pridelenia")}</TabsTrigger>
            <TabsTrigger value="rates">{L("Rate History", "Istorija tarifa", "História sadzieb")}</TabsTrigger>
          </TabsList>
          <TabsContent value="assignments" className="mt-4">{assignmentsView}</TabsContent>
          <TabsContent value="rates" className="mt-4">
            <RateHistory employees={employees} projects={projects} assignments={rawAssignments} />
          </TabsContent>
        </Tabs>
      ) : assignmentsView}

      <AssignmentDetailDrawer open={Boolean(viewRow)} onOpenChange={(o) => !o && setView(null)} assignment={viewRow} shifts={shifts}
        access={access} actions={actions} />
      <AddAssignmentDialog open={addOpen} onOpenChange={setAddOpen} projects={projects} employees={employees} history={history} />
      <EditAssignmentDialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} assignment={edit} today={edit?.today} />
      <ReassignDialog open={Boolean(reassign)} onOpenChange={(o) => !o && setReassign(null)} assignment={reassign?.assignment}
        mode={reassign?.mode} projects={projects} today={reassign?.assignment?.today} />
      <EndAssignmentDialog open={Boolean(end)} onOpenChange={(o) => !o && setEnd(null)} assignment={end?.assignment} mode={end?.mode} />
    </div>
  );
}
