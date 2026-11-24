// Glavna kontrolna tabla (Teamora). Finansije samo za admina (D3; RLS ionako ne vraća iznose operateru):
// prihod, trošak rada i zarada iz ODOBRENIH satnica izabranog perioda (src/lib/payroll/dashboard.js).
// Operater dobija operativni prikaz (At a Glance, satnice na čekanju, dokumenti).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import { AlertTriangle, CalendarDays, ChartColumn, Coins, Percent, Wallet } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate } from "@/lib/dateFormat";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  amountsByDay, changePct, cumulativeSeries, dashboardPeriod, filterTimesheets, overduePayrollMonths, PERIODS, periodKpis, topLists, upcomingPayrollDate, weekStartRange,
} from "@/lib/payroll/dashboard";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import ProfitDonut from "@/components/dashboard/ProfitDonut";
import AtAGlance from "@/components/dashboard/AtAGlance";
import TopTable, { MarginBadge } from "@/components/dashboard/TopTable";
import { formatEur, formatPct } from "@/components/dashboard/format";
import { Layers, Building2 } from "lucide-react";

const PERIOD_LABELS = {
  month: "This Month",
  last_month: "Last Month",
  quarter: "This Quarter",
  year: "This Year",
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

export default function Dashboard() {
  const t = useT();
  const { lang } = useLang();
  const { user, isAdmin } = useAuth();
  const [periodKey, setPeriodKey] = useState("month");
  const [projectId, setProjectId] = useState("all");
  const [clientId, setClientId] = useState("all");

  const todayIso = format(new Date(), "yyyy-MM-dd");
  const period = useMemo(() => dashboardPeriod(periodKey, todayIso), [periodKey, todayIso]);
  const load = weekStartRange(period.prevFrom, period.to);

  const { data: employees = [], isLoading: loadingEmp } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });
  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("name"),
  });
  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list("name"),
  });
  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: () => base44.entities.Document.list("-created_date"),
  });
  const { data: pending = [], isLoading: loadingPending } = useQuery({
    queryKey: ["timesheets", "submitted"],
    queryFn: () => base44.entities.Timesheet.filter({ approval_status: "submitted" }, "-week_start"),
  });
  const { data: approvedAll = [], isLoading: loadingApproved } = useQuery({
    queryKey: ["timesheets", "approved", "dashboard", load.from, load.to],
    queryFn: () =>
      base44.entities.Timesheet.filter({ approval_status: "approved", week_start: { $gte: load.from, $lte: load.to } }, "-week_start"),
    enabled: isAdmin,
  });
  const { data: approvedRuns = [] } = useQuery({
    queryKey: ["payroll-runs", "approved"],
    queryFn: () => base44.entities.PayrollRun.filter({ status: "approved" }, "month"),
    enabled: isAdmin,
    staleTime: 0,
  });

  const finance = useMemo(() => {
    const approved = filterTimesheets(approvedAll, projects, { projectId, clientId });
    const byDay = amountsByDay(approved, period.from, period.to);
    const prevByDay = amountsByDay(approved, period.prevFrom, period.prevTo);
    const kpis = periodKpis(byDay);
    const prev = periodKpis(prevByDay);
    const inPeriod = approved.filter((ts) => ts.week_start >= period.from && ts.week_start <= period.to);
    return {
      kpis,
      prev,
      series: cumulativeSeries(byDay, period.from, period.to),
      top: topLists(inPeriod, projects),
      hasData: kpis.revenue > 0 || kpis.cost > 0,
    };
  }, [approvedAll, projects, period, projectId, clientId]);

  const isLoading = loadingEmp || loadingProjects || loadingClients || loadingPending || (isAdmin && loadingApproved);

  const today = startOfDay(new Date());
  const docAlerts = documents.filter((d) => d.expiration_date && differenceInCalendarDays(parseISO(d.expiration_date), today) <= 30);
  const expiredCount = docAlerts.filter((d) => differenceInCalendarDays(parseISO(d.expiration_date), today) < 0).length;

  const rangeText = `${formatDate(parseISO(period.from), "MMM d", lang)} – ${formatDate(parseISO(period.to), "MMM d, yyyy", lang)}`;
  const header = (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {t(greetingKey(new Date().getHours()))}, {firstName(user)} <span aria-hidden>👋</span>
        </h1>
        <p className="text-muted-foreground mt-1">{t("Here's what's happening with your team, projects and finances.")}</p>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={periodKey} onValueChange={setPeriodKey}>
            <SelectTrigger className="w-[160px] bg-card gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => <SelectItem key={p} value={p}>{t(PERIOD_LABELS[p])}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId("all"); }}>
            <SelectTrigger className="w-[160px] bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All clients")}</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-[160px] bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All projects")}</SelectItem>
              {projects.filter((p) => clientId === "all" || p.client_id === clientId).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground whitespace-nowrap">{rangeText}</span>
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        {isAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        )}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Skeleton className="h-72 rounded-2xl xl:col-span-6" />
          <Skeleton className="h-72 rounded-2xl xl:col-span-3" />
          <Skeleton className="h-72 rounded-2xl xl:col-span-3" />
        </div>
        {isAdmin && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
          </div>
        )}
      </div>
    );
  }

  const activeEmployees = employees.filter((e) => e.status === "active");
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const overdueMonths = overduePayrollMonths(approvedRuns, todayIso);
  const glance = (
    <AtAGlance
      employees={activeEmployees.length}
      projects={projects.filter((p) => p.status === "active").length}
      clients={clients.filter((c) => c.status === "active").length}
      pendingTimesheets={pending.length}
      upcomingPayroll={isAdmin ? formatDate(parseISO(upcomingPayrollDate(approvedRuns, todayIso)), "MMM d", lang) : null}
      overduePayroll={isAdmin && overdueMonths.length > 0 ? formatDate(parseISO(overdueMonths[0]), "MMM yyyy", lang) : null}
    />
  );

  const alerts = docAlerts.length > 0 && (
    <Link to="/documents" className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 hover:bg-orange-100 transition-colors">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        {docAlerts.length} {t("documents expire within 30 days or have expired")}
        {expiredCount > 0 && ` (${expiredCount} ${t("expired")})`}
      </span>
    </Link>
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        {header}
        {alerts}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{glance}</div>
      </div>
    );
  }

  const { kpis, prev } = finance;
  const revenueChange = changeBadge(changePct(kpis.revenue, prev.revenue));
  const costChange = changeBadge(changePct(kpis.cost, prev.cost), { lowerIsBetter: true });
  const profitChange = changeBadge(changePct(kpis.profit, prev.profit));
  const marginChange = prev.revenue > 0 && kpis.marginPct !== null && prev.marginPct !== null
    ? changeBadge(Math.round((kpis.marginPct - prev.marginPct) * 10) / 10, { unit: "pp" })
    : null;

  const nameCell = (icon, text) => (
    <span className="inline-flex items-center gap-2 font-medium">{icon}<span className="truncate">{text}</span></span>
  );
  const projectCols = [
    { key: "project", label: "Project", render: (r) => nameCell(<Layers className="w-4 h-4 text-primary shrink-0" />, projectById.get(r.id)?.name || "—") },
    { key: "client", label: "Client", align: "left", className: "text-muted-foreground", render: (r) => clientById.get(projectById.get(r.id)?.client_id)?.name || "—" },
    { key: "profit", label: "Profit", className: "font-semibold", render: (r) => formatEur(r.profit) },
    { key: "margin", label: "Margin", render: (r) => <MarginBadge pct={r.marginPct} /> },
  ];
  const clientCols = [
    { key: "client", label: "Client", render: (r) => nameCell(<Building2 className="w-4 h-4 text-primary shrink-0" />, clientById.get(r.id)?.name || "—") },
    { key: "revenue", label: "Revenue", className: "text-muted-foreground", render: (r) => formatEur(r.revenue) },
    { key: "profit", label: "Profit", className: "font-semibold", render: (r) => formatEur(r.profit) },
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
    { key: "profit", label: "Profit", className: "font-semibold", render: (r) => formatEur(r.profit) },
    { key: "margin", label: "Margin", render: (r) => <MarginBadge pct={r.marginPct} /> },
  ];

  return (
    <div className="space-y-6">
      {header}
      {alerts}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title={t("Client Revenue")} value={formatEur(kpis.revenue)} icon={Coins} to="/payroll/reports" change={revenueChange} up={revenueChange?.up} />
        <KpiCard title={t("Payroll Cost")} value={formatEur(kpis.cost)} icon={Wallet} to="/payroll/reports" change={costChange} up={costChange?.up} />
        <KpiCard title={t("Gross Profit")} value={formatEur(kpis.profit)} icon={ChartColumn} to="/payroll/reports" tone="green" change={profitChange} up={profitChange?.up} />
        <KpiCard title={t("Profit Margin")} value={formatPct(kpis.marginPct)} icon={Percent} to="/payroll/reports" change={marginChange} up={marginChange?.up} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-6"><RevenueChart series={finance.series} hasData={finance.hasData} /></div>
        <div className="xl:col-span-3"><ProfitDonut kpis={kpis} /></div>
        <div className="xl:col-span-3">{glance}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <TopTable title={t("Top Profitable Projects")} viewAllTo="/projects" columns={projectCols} rows={finance.top.projects} />
        <TopTable title={t("Top Profitable Clients")} viewAllTo="/clients" columns={clientCols} rows={finance.top.clients} />
        <TopTable title={t("Top Profitable Workers")} viewAllTo="/employees" columns={workerCols} rows={finance.top.workers} />
      </div>
    </div>
  );
}
