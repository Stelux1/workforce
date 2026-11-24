// Glavna kontrolna tabla (Teamora, spec §3). Sav novac dolazi iz jedinog obračunskog servisa (src/lib/finance preko
// src/lib/payroll/dashboard.js, D30 K4): interni obračun, obaveze radnicima i potraživanja od klijenata su ODVOJENE
// kartice (T17), svaki iznos je po valuti (T28), a KPI za isti period i filter daje isti broj kao izvorni modul (T27).
// Prava (§3.1): finansijski deo samo uz `reports.financial`, obaveze uz `payroll.view`, potraživanja uz `billing.view`,
// dodatni troškovi uz `costs.view`; HR/Operations vide operativni prikaz bez finansija. Server ionako ne vraća iznose
// bez prava (RLS, maske) — ovde se samo ne prikazuju prazne kartice.
// Svaka kartica i upozorenje vodi na FILTRIRANU izvornu listu (src/lib/listLinks.js).
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle, Building2, CalendarDays, ChartColumn, CirclePlus, ClipboardCheck, Clock, Coins, Layers, Percent, Receipt,
  RefreshCw, Scale, UserPlus, Users, Wallet, FileArchive, GanttChart, HandCoins, FileClock,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT, useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate } from "@/lib/dateFormat";
import { canAccessPath } from "@/lib/access";
import { listUrl, activeAssignmentsUrl } from "@/lib/listLinks";
import { projectOnboarding, WORKER_STATUS } from "@/lib/onboarding";
import { billingBalance, billingTotals, payableBalance, payablesTotals, unbilledRevenue } from "@/lib/finance";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  actionItems, activeProjects, activeWorkers, changePct, cumulativeSeries, currencyEntries, dashboardFinance, dashboardPeriod,
  endingSoon, expiringDocuments, hoursInPeriod, mapEntries, marginChangePp, overduePayrollMonths, PERIODS, primaryCurrency, PROJECT_STATUS_FILTERS,
  resolveFilters, topLists, upcomingPayrollDate, weekStartRange, workforceOverview, workforceShortages, addDays,
} from "@/lib/payroll/dashboard";
import KpiCard from "@/components/dashboard/KpiCard";
import MiniKpi from "@/components/dashboard/MiniKpi";
import RevenueChart from "@/components/dashboard/RevenueChart";
import ProfitDonut from "@/components/dashboard/ProfitDonut";
import AtAGlance from "@/components/dashboard/AtAGlance";
import WorkforceOverview from "@/components/dashboard/WorkforceOverview";
import ActionCenter from "@/components/dashboard/ActionCenter";
import QuickLinks from "@/components/dashboard/QuickLinks";
import TopTable, { MarginBadge } from "@/components/dashboard/TopTable";
import { formatMargin, formatMoney } from "@/components/dashboard/format";

const PERIOD_LABELS = {
  month: "This Month",
  last_month: "Last Month",
  quarter: "This Quarter",
  year: "This Year",
};

const STATUS_LABELS = {
  active: ["Active", "Aktivan", "Aktívny"],
  paused: ["Paused", "Pauziran", "Pozastavený"],
  completed: ["Completed", "Završen", "Dokončený"],
};

function greetingKey(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(user) {
  const name = (user?.full_name || "").trim();
  if (name) return name.split(/\s+/)[0];
  return (user?.email || "").split("@")[0];
}

function initials(name) {
  return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

/** Promena prema prethodnom periodu → tekst badge-a; null kad nema osnovice. `lowerIsBetter` za trošak. */
function changeBadge(pct, { lowerIsBetter = false, unit = "%" } = {}) {
  if (pct === null || pct === undefined) return null;
  const sign = pct > 0 ? "+" : "";
  const good = pct === 0 ? true : lowerIsBetter ? pct < 0 : pct > 0;
  return { text: `${sign}${pct.toFixed(1)}${unit === "pp" ? " pp" : "%"}`, good, up: pct >= 0 };
}

/** Entitet koji druga traka još ne mora da je dodala (Payable, Payment, BillingSummary, ClientPayment) → null. */
const optionalEntity = (name) => base44.entities?.[name] ?? null;

/** Iznosi po valuti → { value, extra, empty }: primarna valuta velikim, ostale ispod; bez iznosa „—". */
function moneyDisplay(entries) {
  const list = entries.filter((e) => e.value !== null && e.value !== undefined);
  if (list.length === 0) return { value: "—", extra: [], empty: true };
  const [first, ...rest] = list;
  return { value: formatMoney(first.value, first.currency), extra: rest.map((e) => formatMoney(e.value, e.currency)), empty: false };
}

export default function Dashboard() {
  const t = useT();
  const L = useL();
  const { lang } = useLang();
  const queryClient = useQueryClient();
  const { user, can, permissions } = useAuth();
  const [periodKey, setPeriodKey] = useState("month");
  const [projectId, setProjectId] = useState("all");
  const [clientId, setClientId] = useState("all");
  const [status, setStatus] = useState("all");
  const [chartCurrency, setChartCurrency] = useState(null);

  const canFin = can("reports.financial");
  const canCosts = can("costs.view");
  const canPayroll = can("payroll.view");
  const canBilling = can("billing.view");
  const canLeave = can("leave.approve");
  const canDocs = can("onboarding.manage") || can("documents.manage");

  const todayIso = format(new Date(), "yyyy-MM-dd");
  const period = useMemo(() => dashboardPeriod(periodKey, todayIso), [periodKey, todayIso]);
  const range = useMemo(() => ({ from: period.from, to: period.to }), [period]);
  const load = weekStartRange(period.prevFrom, period.to);

  const q = (key, fn, extra = {}) => ({ queryKey: key, queryFn: fn, ...extra });
  const employeesQ = useQuery(q(["employees"], () => base44.entities.Employee.list("-created_date")));
  const projectsQ = useQuery(q(["projects"], () => base44.entities.Project.list("name")));
  const clientsQ = useQuery(q(["clients"], () => base44.entities.Client.list("name")));
  const assignmentsQ = useQuery(q(["project-assignments", "all"], () => base44.entities.ProjectAssignment.list("start_date")));
  const documentsQ = useQuery(q(["documents"], () => base44.entities.Document.list("-created_date")));
  const pendingQ = useQuery(q(["timesheets", "submitted"], () => base44.entities.Timesheet.filter({ approval_status: "submitted" }, "-week_start")));
  const approvedQ = useQuery(q(["timesheets", "approved", "dashboard", load.from, load.to], () =>
    base44.entities.Timesheet.filter({ approval_status: "approved", week_start: { $gte: load.from, $lte: load.to } }, "-week_start"), { placeholderData: keepPreviousData }));
  const costsQ = useQuery(q(["project-costs", "dashboard", period.prevFrom, period.to], () =>
    base44.entities.ProjectCost.filter({ cost_date: { $gte: period.prevFrom, $lte: period.to } }, "-cost_date"), { enabled: canCosts, placeholderData: keepPreviousData }));
  const runsQ = useQuery(q(["payroll-runs", "approved"], () => base44.entities.PayrollRun.filter({ status: "approved" }, "month"), { enabled: canPayroll, staleTime: 0 }));

  // Radna snaga: potrebe, smene, raspored i odobrena odsustva u periodu (i danas).
  const wfFrom = addDays(todayIso < period.from ? todayIso : period.from, -1);
  const wfTo = addDays(todayIso > period.to ? todayIso : period.to, 1);
  const requirementsQ = useQuery(q(["workforce-requirements", "dashboard", period.from, period.to], () =>
    base44.entities.WorkforceRequirement.filter({ date_to: { $gte: period.from }, date_from: { $lte: period.to } }, "date_from"), { placeholderData: keepPreviousData }));
  const shiftsQ = useQuery(q(["shifts"], () => base44.entities.Shift.list("sort")));
  const rolesQ = useQuery(q(["project-roles"], () => base44.entities.ProjectRole.list("sort")));
  const schedulesQ = useQuery(q(["schedules", "dashboard", wfFrom, wfTo], () => base44.entities.Schedule.filter({ date: { $gte: wfFrom, $lte: wfTo } }, "date"), { placeholderData: keepPreviousData }));
  const leavesQ = useQuery(q(["leave-requests", "approved"], () => base44.entities.LeaveRequest.filter({ status: "approved" }, "start_date")));
  const pendingLeaveQ = useQuery(q(["leave-requests", "pending"], () => base44.entities.LeaveRequest.filter({ status: "pending" }, "start_date"), { enabled: canLeave }));
  const reqDocsQ = useQuery(q(["required-documents"], () => base44.entities.RequiredDocument.list("created_date"), { enabled: canDocs }));
  const docTypesQ = useQuery(q(["document-types"], () => base44.entities.DocumentType.list("code"), { enabled: canDocs }));

  // Obaveze i potraživanja pripadaju drugim trakama (W2-E, W2-F): dok entiteta nema, kartica kaže „nema podataka".
  const PayableE = optionalEntity("Payable");
  const PaymentE = optionalEntity("Payment");
  const SummaryE = optionalEntity("BillingSummary");
  const ClientPaymentE = optionalEntity("ClientPayment");
  const payablesQ = useQuery(q(["payables", "dashboard"], () => PayableE.list("-created_date"), { enabled: canPayroll && Boolean(PayableE), retry: false }));
  const paymentsQ = useQuery(q(["payments", "dashboard"], () => PaymentE.list("-created_date"), { enabled: canPayroll && Boolean(PayableE && PaymentE), retry: false }));
  const summariesQ = useQuery(q(["billing-summaries", "dashboard"], () => SummaryE.list("-period_end"), { enabled: canBilling && Boolean(SummaryE), retry: false }));
  const clientPaymentsQ = useQuery(q(["client-payments", "dashboard"], () => ClientPaymentE.list("-created_date"), { enabled: canBilling && Boolean(SummaryE && ClientPaymentE), retry: false }));

  const employees = employeesQ.data || [];
  const projects = projectsQ.data || [];
  const clients = clientsQ.data || [];
  const assignments = assignmentsQ.data || [];
  const documents = documentsQ.data || [];
  const pending = pendingQ.data || [];

  const selection = { projectId, clientId, status };
  const resolved = useMemo(() => resolveFilters(projects, selection), [projects, projectId, clientId, status]);
  const scopeIds = resolved.projectIds;

  const finance = useMemo(() => {
    const timesheets = [...(approvedQ.data || []), ...pending];
    return dashboardFinance({ timesheets, costs: costsQ.data || [], projects, assignments, range, prevRange: { from: period.prevFrom, to: period.prevTo }, selection });
  }, [approvedQ.data, pending, costsQ.data, projects, assignments, range, period, projectId, clientId, status]);

  const cur = finance.current;
  const currencies = cur.currencies;
  const primary = primaryCurrency(currencies);
  const activeChartCurrency = currencies.includes(chartCurrency) ? chartCurrency : primary;
  const hasFinData = currencies.length > 0;

  const series = useMemo(() => (hasFinData ? cumulativeSeries(finance.lines, range.from, range.to, activeChartCurrency) : []), [finance.lines, hasFinData, range, activeChartCurrency]);
  const top = useMemo(
    () => topLists({ lines: finance.lines, costs: costsQ.data || [], projects, range, filters: finance.filters, currency: activeChartCurrency }),
    [finance.lines, costsQ.data, projects, range, finance.filters, activeChartCurrency]
  );

  const wf = useMemo(
    () => workforceOverview({ employees, assignments, schedules: schedulesQ.data || [], leaves: leavesQ.data || [], shifts: shiftsQ.data || [], projectRoles: rolesQ.data || [], projects, today: todayIso, range, projectIds: scopeIds }),
    [employees, assignments, schedulesQ.data, leavesQ.data, shiftsQ.data, rolesQ.data, projects, todayIso, range, scopeIds]
  );
  const shortages = useMemo(
    () => workforceShortages({ requirements: requirementsQ.data || [], assignments, schedules: schedulesQ.data || [], leaves: leavesQ.data || [], shifts: shiftsQ.data || [], range, projectIds: scopeIds }),
    [requirementsQ.data, assignments, schedulesQ.data, leavesQ.data, shiftsQ.data, range, scopeIds]
  );
  const projectsScope = useMemo(() => activeProjects(projects, assignments, { ...range, projectIds: scopeIds }), [projects, assignments, range, scopeIds]);
  const workers = useMemo(() => activeWorkers(assignments, { ...range, projectIds: scopeIds }), [assignments, range, scopeIds]);
  const ending = useMemo(() => endingSoon(assignments, todayIso, scopeIds), [assignments, todayIso, scopeIds]);

  const pendingInScope = pending.filter((ts) => !scopeIds || scopeIds.has(ts.project_id));

  // Obaveze (W2-E) i potraživanja (W2-F).
  const payables = payablesQ.data;
  const payments = paymentsQ.data || [];
  const summaries = summariesQ.data;
  const clientPayments = clientPaymentsQ.data || [];
  const payablesState = !canPayroll ? "hidden" : !PayableE ? "nodata" : payablesQ.isError ? "error" : payablesQ.isLoading ? "loading" : "ok";
  const billingState = !canBilling ? "hidden" : !SummaryE ? "nodata" : summariesQ.isError ? "error" : summariesQ.isLoading ? "loading" : "ok";
  const payablesTotal = useMemo(() => (payablesState === "ok" ? payablesTotals(payables, payments, { today: todayIso }) : null), [payablesState, payables, payments, todayIso]);
  const billingTotal = useMemo(() => (billingState === "ok" ? billingTotals(summaries, clientPayments, { today: todayIso }) : null), [billingState, summaries, clientPayments, todayIso]);
  const unbilled = useMemo(() => {
    if (billingState !== "ok") return null;
    const scoped = (summaries || []).filter((s) => !scopeIds || !s.project_id || scopeIds.has(s.project_id));
    return unbilledRevenue(finance.lines, scoped);
  }, [billingState, summaries, finance.lines, scopeIds]);
  const unpaidPayables = useMemo(() => {
    if (payablesState !== "ok") return null;
    const open = (payables || [])
      .filter((p) => p.status === "confirmed")
      .map((p) => payableBalance(p, payments, { today: todayIso }))
      .filter((b) => b.remaining > 0);
    return { count: open.length, overdue: open.filter((b) => b.overdue).length };
  }, [payablesState, payables, payments, todayIso]);
  const overdueReceivables = useMemo(() => {
    if (billingState !== "ok") return null;
    return (summaries || []).filter((s) => billingBalance(s, clientPayments, { today: todayIso }).overdue).length;
  }, [billingState, summaries, clientPayments, todayIso]);

  // Dokumenti.
  const docAlerts = useMemo(() => expiringDocuments(documents, todayIso), [documents, todayIso]);
  const missingDocs = useMemo(() => {
    if (!canDocs || reqDocsQ.isLoading || reqDocsQ.isError || docTypesQ.isLoading || docTypesQ.isError) return null;
    const scoped = projects.filter((p) => (!scopeIds || scopeIds.has(p.id)) && p.status !== "completed");
    let n = 0;
    for (const project of scoped) {
      const rows = projectOnboarding({ project, assignments, employees, requirements: reqDocsQ.data || [], documents, documentTypes: docTypesQ.data || [], today: todayIso, canViewSensitive: can("documents.view_sensitive") });
      n += rows.filter((r) => r.assignment && (!r.assignment.end_date || r.assignment.end_date >= todayIso) && r.status === WORKER_STATUS.ACTION_REQUIRED).length;
    }
    return n;
  }, [canDocs, reqDocsQ.isLoading, reqDocsQ.isError, reqDocsQ.data, docTypesQ.isLoading, docTypesQ.isError, docTypesQ.data, projects, scopeIds, assignments, employees, documents, todayIso, can]);

  const coreLoading = employeesQ.isLoading || projectsQ.isLoading || clientsQ.isLoading || assignmentsQ.isLoading || pendingQ.isLoading || approvedQ.isLoading;
  const failed = [employeesQ, projectsQ, clientsQ, assignmentsQ, pendingQ, approvedQ, costsQ].filter((x) => x.isError);

  const rangeText = `${formatDate(parseISO(period.from), "MMM d", lang)} – ${formatDate(parseISO(period.to), "MMM d, yyyy", lang)}`;
  const statusLabel = (s) => (STATUS_LABELS[s] ? L(...STATUS_LABELS[s]) : s);

  // Adrese filtriranih lista: isti period i filteri kao na kartici.
  const f = { from: period.from, to: period.to, project: projectId, client: clientId, pstatus: status };
  const noPeriod = { project: projectId, client: clientId, pstatus: status };

  const header = (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {t(greetingKey(new Date().getHours()))}, {firstName(user)} <span aria-hidden>👋</span>
        </h1>
        <p className="text-muted-foreground mt-1">{t("Here's what's happening with your team, projects and finances.")}</p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={periodKey} onValueChange={setPeriodKey}>
          <SelectTrigger className="w-[160px] bg-card gap-2" aria-label={L("Period", "Period", "Obdobie")}>
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p} value={p}>{t(PERIOD_LABELS[p])}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId("all"); }}>
          <SelectTrigger className="w-[160px] bg-card" aria-label={L("Client", "Klijent", "Klient")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All clients")}</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-[160px] bg-card" aria-label={L("Project", "Projekat", "Projekt")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All projects")}</SelectItem>
            {projects.filter((p) => clientId === "all" || p.client_id === clientId).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px] bg-card" aria-label={L("Project status", "Status projekta", "Stav projektu")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L("All statuses", "Svi statusi", "Všetky stavy")}</SelectItem>
            {PROJECT_STATUS_FILTERS.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground whitespace-nowrap">{rangeText}</span>
      </div>
    </div>
  );

  if (coreLoading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Skeleton className="h-72 rounded-2xl xl:col-span-6" />
          <Skeleton className="h-72 rounded-2xl xl:col-span-3" />
          <Skeleton className="h-72 rounded-2xl xl:col-span-3" />
        </div>
      </div>
    );
  }

  const activeEmployees = employees.filter((e) => e.status === "active");
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const overdueMonths = canPayroll ? overduePayrollMonths(runsQ.data || [], todayIso) : [];
  const glance = (
    <AtAGlance
      employees={activeEmployees.length}
      projects={projects.filter((p) => p.status === "active").length}
      clients={clients.filter((c) => c.status === "active").length}
      pendingTimesheets={pending.length}
      employeesTo={listUrl("/employees", { status: "active" })}
      projectsTo={listUrl("/projects", { status: "active" })}
      pendingTo={listUrl("/timesheets", { status: "submitted" })}
      upcomingPayroll={canPayroll ? formatDate(parseISO(upcomingPayrollDate(runsQ.data || [], todayIso)), "MMM d", lang) : null}
      overduePayroll={canPayroll && overdueMonths.length > 0 ? formatDate(parseISO(overdueMonths[0]), "MMM yyyy", lang) : null}
    />
  );

  // ── finansijske kartice (samo uz reports.financial) ──
  const p = cur.byCurrency[primary];
  const pv = finance.previous?.byCurrency?.[primary];
  const revenueChange = pv ? changeBadge(changePct(p?.laborRevenue ?? 0, pv.laborRevenue)) : null;
  const costChange = pv ? changeBadge(changePct(p?.payrollCost ?? 0, pv.payrollCost), { lowerIsBetter: true }) : null;
  const profitChange = pv ? changeBadge(changePct(p?.netProfit ?? 0, pv.netProfit)) : null;
  const marginChange = pv ? changeBadge(marginChangePp(p?.profitMargin, pv.profitMargin), { unit: "pp" }) : null;
  const finLink = listUrl("/payroll/reports", f);
  const noHours = L("No approved hours in this period", "Nema odobrenih sati u ovom periodu", "V tomto období nie sú schválené hodiny");
  const fin = (field) => moneyDisplay(currencyEntries(cur.byCurrency, field));
  const revenue = fin("laborRevenue");
  const payrollCost = fin("payrollCost");
  const profit = fin("netProfit");
  const marginText = p ? formatMargin(p.profitMargin) : "—";

  const approvedHoursLink = listUrl("/timesheets", { ...f, status: "approved" });
  // Sati se računaju bez novca (HR ne vidi tarife, pa bi snimak tarifa dao 0 sati): approved iz perioda, submitted odvojeno.
  const approvedHours = hoursInPeriod(approvedQ.data || [], "approved", { ...range, projectIds: scopeIds });
  const pendingHours = hoursInPeriod(pending, "submitted", { ...range, projectIds: scopeIds });
  const approvedHoursCard = {
    title: L("Approved Hours", "Odobreni sati", "Schválené hodiny"),
    value: `${approvedHours}h`,
    sub: pendingHours > 0
      ? L(`+${pendingHours}h awaiting approval (estimate, not included)`, `+${pendingHours}h čeka odobrenje (procena, nije uključeno)`, `+${pendingHours}h čaká na schválenie (odhad, nezahrnuté)`)
      : undefined,
    icon: Clock,
    to: approvedHoursLink,
  };

  const addCosts = moneyDisplay(currencyEntries(cur.byCurrency, "additionalCosts").filter((e) => e.value > 0));
  const addCostsCard = canCosts && {
    title: L("Additional Project Costs", "Dodatni troškovi projekata", "Dodatné náklady projektov"),
    ...(costsQ.isError ? { value: "—", empty: true, extra: [], sub: L("Not loaded", "Nije učitano", "Nenačítané") } : addCosts.empty
      ? { value: "—", empty: true, extra: [], sub: L("No costs in this period", "Nema troškova u ovom periodu", "V tomto období nie sú náklady") }
      : { value: addCosts.value, extra: addCosts.extra }),
    icon: Receipt,
    to: listUrl("/project-costs", f),
  };

  const flowCard = (title, icon, state, display, subOk, to, extraSub) => ({
    title,
    icon,
    to,
    ...(state === "ok"
      ? (display.empty ? { value: "—", empty: true, extra: [], sub: subOk } : { value: display.value, extra: display.extra, sub: extraSub })
      : { value: "—", empty: true, extra: [], sub: state === "error" ? L("Not loaded", "Nije učitano", "Nenačítané") : state === "loading" ? L("Loading…", "Učitavanje…", "Načítava sa…") : L("No data yet", "Nema podataka", "Zatiaľ žiadne údaje") }),
  });
  const payablesDisplay = payablesTotal ? moneyDisplay(mapEntries(payablesTotal, (v) => (v.remaining > 0 ? v.remaining : null))) : null;
  const payablesCard = canPayroll && flowCard(
    L("Payables", "Obaveze (isplate)", "Záväzky (výplaty)"), HandCoins, payablesState, payablesDisplay,
    L("Nothing left to pay", "Nema neisplaćenog", "Nič na vyplatenie"), listUrl("/payroll/payables", { status: "unpaid" }),
    L("Confirmed, not yet paid out", "Potvrđeno, još neisplaćeno", "Potvrdené, zatiaľ nevyplatené")
  );
  const unpaidDisplay = billingTotal ? moneyDisplay(mapEntries(billingTotal, (v) => (v.outstanding > 0 ? v.outstanding : null))) : null;
  const unpaidCard = canBilling && flowCard(
    L("Client Unpaid", "Neplaćeno od klijenata", "Neuhradené od klientov"), Scale, billingState, unpaidDisplay,
    L("No open externally invoiced receivables", "Nema otvorenih eksterno fakturisanih potraživanja", "Žiadne otvorené externe fakturované pohľadávky"),
    listUrl("/clients", { status: "outstanding", client: clientId, project: projectId }),
    L("Externally invoiced, not yet received", "Eksterno fakturisano, još neprimljeno", "Externe fakturované, zatiaľ neprijaté")
  );
  const unbilledDisplay = unbilled ? moneyDisplay(mapEntries(unbilled.revenue, (v) => (v > 0 ? v : null))) : null;
  const unbilledCard = canBilling && flowCard(
    L("Unbilled Revenue", "Nefakturisan prihod", "Nevyfakturované tržby"), FileClock, billingState, unbilledDisplay,
    finance.lines.length === 0
      ? L("No approved work with rates in this period", "Nema odobrenog rada sa tarifama u ovom periodu", "V tomto období nie je schválená práca so sadzbami")
      : L("All approved work is in a billing summary", "Sav odobreni rad je u obračunu klijenta", "Všetka schválená práca je v zúčtovaní klienta"),
    listUrl("/clients", { view: "unbilled", client: clientId, project: projectId }),
    L("Approved work not in any billing summary", "Odobreni rad koji nije ni u jednom obračunu", "Schválená práca mimo zúčtovania")
  );

  const opCards = [
    { key: "workers", title: L("Active Workers", "Aktivni radnici", "Aktívni pracovníci"), value: String(workers), icon: Users, to: listUrl("/assignments", f), // isti period → isti broj na Project Assignments (T27)
      sub: L("Unique workers with an assignment in the period", "Jedinstveni radnici sa angažmanom u periodu", "Jedineční pracovníci s pridelením v období") },
    { key: "projects", title: L("Active Projects", "Aktivni projekti", "Aktívne projekty"), value: String(projectsScope.total), icon: Layers, to: listUrl("/projects", { status: "active" }),
      sub: L(`${projectsScope.byStatus} with status Active · ${projectsScope.byAssignment} with assignments in the period`, `${projectsScope.byStatus} sa statusom Aktivan · ${projectsScope.byAssignment} sa angažmanom u periodu`, `${projectsScope.byStatus} so stavom Aktívny · ${projectsScope.byAssignment} s pridelením v období`) },
    { key: "hours", ...approvedHoursCard },
  ];

  // Prvi red: finansije (slika2) za korisnike sa finansijskim pravom, inače operativne kartice.
  const topRow = canFin ? (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <KpiCard title={L("Calculated B2B Revenue", "Obračunati B2B prihod", "Vypočítané B2B tržby")} {...revenue} icon={Coins} to={finLink} change={revenueChange} up={revenueChange?.up} sub={hasFinData ? undefined : noHours} />
      <KpiCard title={t("Payroll Cost")} {...payrollCost} icon={Wallet} to={finLink} change={costChange} up={costChange?.up} sub={hasFinData ? undefined : noHours} />
      <KpiCard title={t("Project Profit")} {...profit} icon={ChartColumn} to={finLink} tone="green" change={profitChange} up={profitChange?.up} sub={hasFinData ? undefined : noHours} />
      <KpiCard
        title={t("Profit Margin")} value={marginText} empty={!p || p.profitMargin === null} icon={Percent} to={finLink} change={marginChange} up={marginChange?.up}
        sub={p && p.profitMargin === null ? L("No revenue in this period", "Nema prihoda u ovom periodu", "V tomto období nie sú tržby") : hasFinData ? undefined : noHours}
      />
    </div>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {opCards.map(({ key, ...c }) => <KpiCard key={key} {...c} />)}
      <KpiCard title={t("Pending Timesheets")} value={String(pendingInScope.length)} icon={Clock} to={listUrl("/timesheets", { status: "submitted", ...noPeriod })} />
    </div>
  );

  const stripCards = [
    ...(canFin ? opCards : []),
    ...(canFin || canCosts ? [addCostsCard] : []),
    payablesCard,
    unpaidCard,
    unbilledCard,
  ].filter(Boolean);
  const strip = stripCards.length > 0 && (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      {stripCards.map(({ key, title, ...c }) => <MiniKpi key={key || title} title={title} {...c} />)}
    </div>
  );

  // ── Action Center ──
  const items = actionItems([
    canLeave && !pendingLeaveQ.isError ? { key: "leave", count: pendingLeaveQ.isLoading ? null : (pendingLeaveQ.data || []).length, tone: "warning", label: L("Leave requests waiting for approval", "Zahtevi za odsustvo na odobrenju", "Žiadosti o voľno čakajúce na schválenie"), to: listUrl("/leave-requests", { status: "pending" }) } : null,
    { key: "shortage", count: requirementsQ.isError ? null : shortages.projects, tone: "danger", label: L("Workforce shortages", "Nedostatak radne snage", "Nedostatok pracovnej sily"),
      detail: L(`${shortages.deficit} missing worker-shifts on ${shortages.days} day(s)`, `${shortages.deficit} nedostajućih radnika-smena u ${shortages.days} dana`, `${shortages.deficit} chýbajúcich pracovníkov-zmien počas ${shortages.days} dní`),
      to: listUrl("/workforce", { from: period.from, to: period.to, project: projectId, client: clientId, pstatus: status }) },
    { key: "ending", count: ending.length, tone: "warning", label: L("Assignments ending within 30 days", "Angažmani koji ističu u narednih 30 dana", "Pridelenia končiace do 30 dní"), to: listUrl("/assignments", { status: "ending_soon", ...noPeriod }) },
    { key: "docs", count: docAlerts.total, tone: docAlerts.expired > 0 ? "danger" : "warning", label: `${t("documents expire within 30 days or have expired")}`,
      detail: docAlerts.expired > 0 ? `${docAlerts.expired} ${t("expired")}` : undefined, to: "/documents" },
    { key: "missing", count: missingDocs, tone: "danger", label: L("Workers missing required documents", "Radnici kojima fale obavezna dokumenta", "Pracovníci s chýbajúcimi povinnými dokumentmi"), to: "/projects" },
    { key: "timesheets", count: pendingInScope.length, tone: "info", label: t("Pending Timesheets"), to: listUrl("/timesheets", { status: "submitted", ...noPeriod }) },
    unpaidPayables ? { key: "payables", count: unpaidPayables.count, tone: unpaidPayables.overdue > 0 ? "danger" : "info", label: L("Unpaid payables", "Neisplaćene obaveze", "Nevyplatené záväzky"),
      detail: unpaidPayables.overdue > 0 ? L(`${unpaidPayables.overdue} past due`, `${unpaidPayables.overdue} kasni`, `${unpaidPayables.overdue} po splatnosti`) : undefined, to: listUrl("/payroll/payables", { status: unpaidPayables.overdue > 0 ? "overdue" : "unpaid" }) } : null,
    overdueReceivables !== null ? { key: "receivables", count: overdueReceivables, tone: "danger", label: L("Overdue client receivables", "Dospela potraživanja od klijenata", "Splatné pohľadávky od klientov"), to: listUrl("/clients", { status: "overdue" }) } : null,
  ].filter(Boolean));
  const actionLoading = shiftsQ.isLoading && requirementsQ.isLoading;
  const actionFailed = requirementsQ.isError || documentsQ.isError || pendingLeaveQ.isError || reqDocsQ.isError || payablesQ.isError || summariesQ.isError;

  // ── Quick Links po pravima ──
  const quick = [
    { key: "assignment", label: L("New Assignment", "Novi angažman", "Nové pridelenie"), icon: UserPlus, to: "/assignments?action=new", ok: can("assignments.manage") },
    { key: "cost", label: L("Add Project Cost", "Dodaj trošak projekta", "Pridať náklad projektu"), icon: CirclePlus, to: "/project-costs?action=new", ok: can("costs.manage") },
    { key: "timesheets", label: L("Review Timesheets", "Pregled satnica", "Kontrola výkazov"), icon: ClipboardCheck, to: listUrl("/timesheets", { status: "submitted" }), ok: can("timesheets.approve") || can("timesheets.edit") },
    { key: "onboarding", label: L("Prepare Onboarding ZIP", "Pripremi onboarding ZIP", "Pripraviť onboarding ZIP"), icon: FileArchive, to: "/projects", ok: can("onboarding.manage") || can("onboarding.export") },
    { key: "workforce", label: L("Open Workforce Plan", "Otvori plan radne snage", "Otvoriť plán pracovnej sily"), icon: GanttChart, to: "/workforce", ok: true },
  ].filter((l) => l.ok && canAccessPath(l.to.split("?")[0], permissions));

  const workforceCard = (
    <WorkforceOverview
      data={wf}
      loading={schedulesQ.isLoading || leavesQ.isLoading}
      error={schedulesQ.isError || leavesQ.isError || shiftsQ.isError}
      assignmentsTo={activeAssignmentsUrl(noPeriod)}
      projectTo={(r) => activeAssignmentsUrl({ project: r.key })}
      positionTo={() => activeAssignmentsUrl(noPeriod)}
    />
  );
  const actionCard = <ActionCenter items={items} loading={actionLoading} error={actionFailed} />;
  const quickCard = <QuickLinks links={quick} />;

  const nameCell = (icon, text) => (
    <span className="inline-flex items-center gap-2 font-medium">{icon}<span className="truncate">{text}</span></span>
  );
  const money = (v) => formatMoney(v, activeChartCurrency);
  const projectCols = [
    { key: "project", label: "Project", render: (r) => nameCell(<Layers className="w-4 h-4 text-primary shrink-0" />, projectById.get(r.id)?.name || "—") },
    { key: "client", label: "Client", align: "left", className: "text-muted-foreground", render: (r) => clientById.get(projectById.get(r.id)?.client_id)?.name || "—" },
    { key: "profit", label: "Profit", className: "font-semibold", render: (r) => money(r.profit) },
    { key: "margin", label: "Margin", render: (r) => <MarginBadge pct={r.marginPct} /> },
  ];
  const clientCols = [
    { key: "client", label: "Client", render: (r) => nameCell(<Building2 className="w-4 h-4 text-primary shrink-0" />, clientById.get(r.id)?.name || "—") },
    { key: "revenue", label: "Revenue", className: "text-muted-foreground", render: (r) => money(r.revenue) },
    { key: "profit", label: "Profit", className: "font-semibold", render: (r) => money(r.profit) },
    { key: "margin", label: "Margin", render: (r) => <MarginBadge pct={r.marginPct} /> },
  ];
  const workerCols = [
    {
      key: "employee",
      label: "Employee",
      render: (r) => {
        const e = employeeById.get(r.id);
        const name = e ? `${e.first_name || ""} ${e.last_name || ""}`.trim() : "—";
        return nameCell(
          e?.profile_photo
            ? <img src={e.profile_photo} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            : <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0">{initials(name)}</span>,
          name,
        );
      },
    },
    { key: "hours", label: "Billed Hours", className: "text-muted-foreground", render: (r) => `${r.hours}h` },
    { key: "profit", label: "Labor Margin", className: "font-semibold", render: (r) => money(r.profit) },
    { key: "margin", label: "Margin", render: (r) => <MarginBadge pct={r.marginPct} /> },
  ];

  const errorBanner = failed.length > 0 && (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{L("Some dashboard data could not be loaded. The numbers below may be incomplete.", "Neki podaci table nisu učitani. Brojevi ispod mogu biti nepotpuni.", "Niektoré údaje nástenky sa nepodarilo načítať. Čísla nižšie môžu byť neúplné.")}</span>
      <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={() => queryClient.refetchQueries({ predicate: (qq) => qq.state.status === "error" })}>
        <RefreshCw className="w-3.5 h-3.5" />{L("Retry", "Pokušaj ponovo", "Skúsiť znova")}
      </Button>
    </div>
  );

  const problemSheets = new Set(cur.problems.map((x) => x.timesheetId)).size;
  const missingFx = canFin && (cur.missingRevenueRate > 0 || cur.missingCostRate > 0 || problemSheets > 0) && (
    <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning" role="status">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        {problemSheets > 0
          ? L(`${problemSheets} approved timesheet(s) have a rate problem and are not in the amounts (their hours are still counted in Approved Hours).`, `${problemSheets} odobrenih satnica ima problem sa tarifom i nisu u iznosima (njihovi sati su ipak u Odobrenim satima).`, `${problemSheets} schválených výkazov má problém so sadzbou a nie sú v sumách (ich hodiny sú aj tak v Schválených hodinách).`)
          : L("Some approved hours have no rate or coefficient and are not in the amounts.", "Neki odobreni sati nemaju tarifu ili koeficijent i nisu u iznosima.", "Niektoré schválené hodiny nemajú sadzbu alebo koeficient a nie sú v sumách.")}
      </span>
    </div>
  );

  if (!canFin) {
    return (
      <div className="space-y-6">
        {header}
        {errorBanner}
        {topRow}
        {strip}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-5">{workforceCard}</div>
          <div className="xl:col-span-4">{actionCard}</div>
          <div className="xl:col-span-3">{glance}</div>
        </div>
        {quickCard && <div>{quickCard}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {errorBanner}
      {missingFx}
      {topRow}
      {strip}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-6"><RevenueChart series={series} hasData={series.some((x) => x.revenue !== 0 || x.cost !== 0)} currency={activeChartCurrency} currencies={currencies} onCurrency={setChartCurrency} /></div>
        <div className="xl:col-span-3"><ProfitDonut kpi={cur.byCurrency[activeChartCurrency]} currency={activeChartCurrency} /></div>
        <div className="xl:col-span-3">{glance}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-5">{workforceCard}</div>
        <div className="xl:col-span-4">{actionCard}</div>
        <div className="xl:col-span-3">{quickCard}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <TopTable title={t("Top Profitable Projects")} viewAllTo="/projects" columns={projectCols} rows={top.projects} />
        <TopTable title={t("Top Profitable Clients")} viewAllTo="/clients" columns={clientCols} rows={top.clients} />
        <TopTable title={t("Top Profitable Workers")} viewAllTo={activeAssignmentsUrl(noPeriod)} columns={workerCols} rows={top.workers} />
      </div>
    </div>
  );
}
