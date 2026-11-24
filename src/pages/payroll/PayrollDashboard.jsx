import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, DollarSign, TrendingUp, Users, AlertCircle, ArrowUpRight } from "lucide-react";
import { startOfWeek, endOfWeek, parseISO } from "date-fns";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate } from "@/lib/dateFormat";
import { round2 } from "@/lib/payroll/money";
import { payrollDue, timesheetTotals, totalsByClient, totalsByWorker } from "@/lib/payroll/reports";

export default function PayrollDashboard() {
  const t = useT();
  const { lang } = useLang();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  // Ranije: 500 satnica sortiranih po nepostojećem polju „date" — sa više podataka deo se nije računao (§9.1 #9).
  // Sada: sve odobrene i sve poslate, sloj podataka čita u delovima.
  const { data: approved = [], isLoading: tsLoading } = useQuery({
    queryKey: ["timesheets", "approved"],
    queryFn: () => base44.entities.Timesheet.filter({ approval_status: "approved" }, "-week_start"),
  });
  const { data: pendingTimesheets = [] } = useQuery({
    queryKey: ["timesheets", "submitted"],
    queryFn: () => base44.entities.Timesheet.filter({ approval_status: "submitted" }, "-week_start"),
  });
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("name"),
  });
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list("name"),
  });

  // „Payroll Due" iz mesečnog obračuna (D17): odobreni, a neisplaćeni obračuni i njihovi listići. Stranica i tabele
  // obračuna su samo za admina (ADMIN_ONLY_PREFIXES + RLS). Status se menja na Mesečnom obračunu, pa se ovo uvek
  // osvežava pri otvaranju (staleTime 0). Stari nedeljni zapisi (payroll_records) se više ne koriste.
  const { data: approvedRuns = [], isLoading: runsLoading } = useQuery({
    queryKey: ["payroll-runs", "approved"],
    queryFn: () => base44.entities.PayrollRun.filter({ status: "approved" }, "month"),
    staleTime: 0,
  });
  const dueRunIds = approvedRuns.map((r) => r.id).sort();
  const { data: duePayslips = [], isLoading: slipsLoading } = useQuery({
    queryKey: ["payslips", "runs", dueRunIds.join(",")],
    queryFn: () => base44.entities.Payslip.filter({ run_id: dueRunIds }),
    enabled: dueRunIds.length > 0,
    staleTime: 0,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });

  // Zbirovi samo iz odobrenih satnica, u centima (src/lib/payroll/reports.js).
  const totals = timesheetTotals(approved);
  const totalHours = totals.hours;
  const totalCost = totals.cost;
  const totalRevenue = totals.revenue;
  const totalProfit = round2(totalRevenue - totalCost);
  const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;

  // Za isplatu = zbir „za isplatu" (neto / iznos podizvođača) odobrenih, a još neisplaćenih mesečnih obračuna.
  const due = payrollDue(approvedRuns, duePayslips);
  const monthLabel = (month) => formatDate(parseISO(month), "LLLL yyyy", lang).replace(/^./, (c) => c.toUpperCase());
  const monthLink = (month) => `/payroll/monthly?month=${month.slice(0, 7)}`;
  const dueTrend = due.months.length === 0
    ? t("No pending payments")
    : due.months.length <= 2
      ? due.months.map((m) => monthLabel(m.month)).join(", ")
      : `${monthLabel(due.months[0].month)} – ${monthLabel(due.months[due.months.length - 1].month)}`;

  // Radnik po employee_id, klijent po project_id → projects.client_id; ime je samo za prikaz (trenutni red po ID-u),
  // pa preimenovanje klijenta ne menja nijednu brojku. Bez klijenta / ručno uneto je posebna grupa, ne spaja se po imenu.
  const unassignedClientLabel = lang === "rs" ? "Bez klijenta / ručno uneto" : lang === "sk" ? "Bez klienta / zadané ručne" : "No client / entered manually";
  const topWorkers = totalsByWorker(approved)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);
  const topClients = totalsByClient(approved, projects, clients)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  // Klijent satnice se čita preko projekta, pa brojke čekaju i projekte i klijente (inače bi sve palo u „bez klijenta").
  const isLoading = tsLoading || runsLoading || slipsLoading || projectsLoading || clientsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("Payroll Dashboard")}</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{t("Payroll Dashboard")}</h1>
          <p className="text-muted-foreground mt-1">{t("Financial overview & workforce profitability")}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/timesheets" className="text-sm text-primary hover:underline flex items-center gap-1">
            {t("Timesheets")} <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("Total Hours Worked")} value={totalHours.toFixed(1) + "h"} icon={Clock} trend={t("All approved timesheets")} />
        <StatCard title={t("Total Payroll Cost")} value={"€" + totalCost.toLocaleString("en", { maximumFractionDigits: 0 })} icon={DollarSign} trend={t("Worker payments")} />
        <StatCard title={t("Total Client Revenue")} value={"€" + totalRevenue.toLocaleString("en", { maximumFractionDigits: 0 })} icon={TrendingUp} trend={t("B2B billing")} />
        <StatCard title={t("Net Profit")} value={"€" + totalProfit.toLocaleString("en", { maximumFractionDigits: 0 })} icon={TrendingUp} trend={`${profitMargin}% ${t("margin")}`} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("Profit Margin")} value={profitMargin + "%"} icon={TrendingUp} />
        <StatCard title={t("Payroll Due")} value={"€" + due.total.toLocaleString("en", { maximumFractionDigits: 0 })} icon={AlertCircle} trend={dueTrend} />
        <StatCard title={t("Pending Approvals")} value={pendingTimesheets.length} icon={Clock} trend={t("Timesheets awaiting review")} />
        <StatCard title={t("Active Employees")} value={employees.filter(e => e.status === "active").length} icon={Users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Profitable Workers */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("Top Profitable Workers")}</CardTitle>
              <Link to="/payroll/reports" className="text-xs text-primary hover:underline">{t("View report")}</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {topWorkers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t("No data yet")}</p>}
            {topWorkers.map((data) => (
              <div key={data.key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="text-sm font-medium">{data.name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{data.hours.toFixed(1)}h {t("h worked").replace("h ", "")}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-primary">€{data.profit.toLocaleString("en", { maximumFractionDigits: 0 })}</p>
                  <p className="text-xs text-muted-foreground">{t("profit")}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Profitable Clients */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("Top Profitable Clients")}</CardTitle>
              <Link to="/payroll/reports" className="text-xs text-primary hover:underline">{t("View report")}</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {topClients.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t("No data yet")}</p>}
            {topClients.map((data) => (
              <div key={data.key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className={`text-sm font-medium ${data.unassigned ? "italic text-muted-foreground" : ""}`}>{data.unassigned ? unassignedClientLabel : data.name}</p>
                  <p className="text-xs text-muted-foreground">€{data.revenue.toLocaleString("en", { maximumFractionDigits: 0 })} {t("revenue")}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-primary">€{data.profit.toLocaleString("en", { maximumFractionDigits: 0 })}</p>
                  <p className="text-xs text-muted-foreground">{t("profit")}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Pending Payroll */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("Pending Payroll")}</CardTitle>
              <Link to="/payroll/monthly" className="text-xs text-primary hover:underline">{t("Manage")}</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {due.months.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t("No pending payments")}</p>}
            {due.months.map((m) => (
              <Link key={m.runId} to={monthLink(m.month)} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="text-sm font-medium">{monthLabel(m.month)}</p>
                  <p className="text-xs text-muted-foreground">{t("Payslips")}: {m.workers} · {t("approved, not paid yet")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">€{m.payout.toFixed(2)}</span>
                  <StatusBadge status="approved" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Pending Timesheet Approvals */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("Awaiting Approval")}</CardTitle>
              <Link to="/timesheets" className="text-xs text-primary hover:underline">{t("Review all")}</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingTimesheets.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t("All caught up!")}</p>}
            {pendingTimesheets.slice(0, 5).map((ts) => (
              <div key={ts.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="text-sm font-medium">{ts.employee_name}</p>
                  <p className="text-xs text-muted-foreground">{ts.week_start && `${lang === "rs" ? "nedelja od" : lang === "sk" ? "týždeň od" : "week of"} ${formatDate(parseISO(ts.week_start), "dd.MM.yyyy", lang)}`} · {Number(ts.total_hours ?? 0).toFixed(1)}h</p>
                </div>
                <StatusBadge status={ts.approval_status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}