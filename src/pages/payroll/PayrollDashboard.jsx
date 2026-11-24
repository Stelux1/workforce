// Kontrolna tabla obračuna. Rad (sati, Payroll Cost, B2B prihod, marža) dolazi iz jednog obračunskog servisa
// (src/lib/finance: financialSummary / laborDayLines / aggregateLabor — odobrene satnice, tarifa po danu, §3.2) i
// uvek je po valuti (D30 K3/K4, T28) — valute se ne sabiraju. „Payroll Due" je Σ Remaining potvrđenih obaveza
// (Payables, §7), odvojeno od obračunatog troška (T17): obračunato nije isplaćeno, nacrt nije dug.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, DollarSign, TrendingUp, Users, AlertCircle, ArrowUpRight } from "lucide-react";
import { parseISO } from "date-fns";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import StatCard from "@/components/dashboard/StatCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { PayableStatusBadge, fetchByIds, money, personName } from "@/components/payroll/payablesShared";
import { usePayablesLabels } from "@/components/payroll/payablesLabels";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate } from "@/lib/dateFormat";
import { aggregateLabor, financialSummary, laborDayLines, sortCurrencies } from "@/lib/finance";
import { payablesDue } from "@/lib/payroll/reports";

// Iznos po valuti u jednom redu („1.200,00 EUR · 30.000,00 RSD"); bez iznosa „—".
const perCurrency = (byCur, lang, pick = (v) => v) => {
  const curs = sortCurrencies(Object.keys(byCur || {}));
  return curs.length ? curs.map((c) => money(pick(byCur[c]), c, lang)).join(" · ") : "—";
};
const subtract = (a = {}, b = {}) => Object.fromEntries(sortCurrencies([...new Set([...Object.keys(a), ...Object.keys(b)])])
  .map((c) => [c, Math.round(((a[c] || 0) - (b[c] || 0)) * 100) / 100]));
// Rang po marži u glavnoj valuti (EUR ako postoji, inače prva) — samo za redosled, prikaz je po valuti.
const rankValue = (margin) => {
  const curs = sortCurrencies(Object.keys(margin));
  return curs.length ? margin[curs.includes("EUR") ? "EUR" : curs[0]] : 0;
};

export default function PayrollDashboard() {
  const t = useT();
  const { lang } = useLang();
  const { T: P } = usePayablesLabels();

  const { data: approved = [], isLoading: tsLoading } = useQuery({
    queryKey: ["timesheets", "approved"],
    queryFn: () => base44.entities.Timesheet.filter({ approval_status: "approved" }, "-week_start"),
  });
  const { data: pendingTimesheets = [] } = useQuery({
    queryKey: ["timesheets", "submitted"],
    queryFn: () => base44.entities.Timesheet.filter({ approval_status: "submitted" }, "-week_start"),
  });
  const { data: projects = [], isLoading: projectsLoading } = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list("name") });
  const { data: clients = [], isLoading: clientsLoading } = useQuery({ queryKey: ["clients"], queryFn: () => base44.entities.Client.list("name") });
  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: () => base44.entities.Employee.list("-created_date") });
  const { data: vendors = [] } = useQuery({ queryKey: ["vendors"], queryFn: () => base44.entities.Vendor.list("name") });

  // Payroll Due: potvrđene obaveze i njihove isplate (Payables). Status se menja na stranici obaveza → staleTime 0.
  const { data: due, isLoading: dueLoading } = useQuery({
    queryKey: ["payables-due"],
    staleTime: 0,
    queryFn: async () => {
      const payables = await base44.entities.Payable.filter({ status: "confirmed" }, "period_start");
      const payments = await fetchByIds("Payment", "payable_id", payables.map((p) => p.id), "payment_date");
      return { payables, payments };
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const summary = useMemo(() => financialSummary({ timesheets: approved, projects }), [approved, projects]);
  const lines = useMemo(() => laborDayLines(approved, { projects }).lines, [approved, projects]);
  const payroll = useMemo(() => payablesDue(due?.payables || [], due?.payments || [], { today }), [due, today]);

  const revenue = Object.fromEntries(Object.entries(summary.byCurrency).map(([c, v]) => [c, v.laborRevenue]));
  const cost = Object.fromEntries(Object.entries(summary.byCurrency).map(([c, v]) => [c, v.payrollCost]));
  const margin = Object.fromEntries(Object.entries(summary.byCurrency).map(([c, v]) => [c, v.laborMargin]));
  const marginPct = Object.entries(summary.byCurrency)
    .filter(([, v]) => v.laborRevenue > 0)
    .map(([c, v]) => `${((v.laborMargin / v.laborRevenue) * 100).toFixed(1)}% ${c}`)
    .join(" · ") || "—";

  const unassignedClientLabel = lang === "rs" ? "Bez klijenta / ručno uneto" : lang === "sk" ? "Bez klienta / zadané ručne" : "No client / entered manually";
  const ranked = (groupBy, nameOf) => aggregateLabor(lines, groupBy)
    .map((g) => ({ ...g, margin: subtract(g.revenue, g.cost), name: nameOf(g.key), unassigned: g.key === null }))
    .sort((a, b) => rankValue(b.margin) - rankValue(a.margin))
    .slice(0, 5);
  const topWorkers = ranked("employee", (id) => personName(employees.find((e) => e.id === id)));
  const topClients = ranked("client", (id) => clients.find((c) => c.id === id)?.name || null);

  const payeeName = (p) => (p.payee_type === "vendor" ? vendors.find((v) => v.id === p.vendor_id)?.name : personName(employees.find((e) => e.id === p.employee_id))) || P.unknownPayee;
  const dueTrend = payroll.openCount === 0
    ? t("No pending payments")
    : `${P.payablesCount(payroll.openCount)}${Object.values(payroll.byCurrency).some((v) => v.overdue > 0) ? ` · ${P.overdue}: ${perCurrency(payroll.byCurrency, lang, (v) => v.overdue)}` : ""}`;

  const isLoading = tsLoading || dueLoading || projectsLoading || clientsLoading;
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
        <div className="flex gap-4">
          <Link to="/payroll/payables" className="text-sm text-primary hover:underline flex items-center gap-1">
            {P.title} <ArrowUpRight className="w-3 h-3" />
          </Link>
          <Link to="/timesheets" className="text-sm text-primary hover:underline flex items-center gap-1">
            {t("Timesheets")} <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("Total Hours Worked")} value={summary.approvedHours.toFixed(1) + "h"} icon={Clock} trend={t("All approved timesheets")} />
        <StatCard title={t("Total Payroll Cost")} value={perCurrency(cost, lang)} icon={DollarSign} trend={t("Worker payments")} />
        <StatCard title={t("Total Client Revenue")} value={perCurrency(revenue, lang)} icon={TrendingUp} trend={t("B2B billing")} />
        <StatCard title={t("Net Profit")} value={perCurrency(margin, lang)} icon={TrendingUp} trend={`${marginPct} ${t("margin")}`} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("Profit Margin")} value={marginPct} icon={TrendingUp} />
        <StatCard title={t("Payroll Due")} value={perCurrency(payroll.byCurrency, lang, (v) => v.remaining)} icon={AlertCircle} trend={dueTrend} />
        <StatCard title={t("Pending Approvals")} value={pendingTimesheets.length} icon={Clock} trend={t("Timesheets awaiting review")} />
        <StatCard title={t("Active Employees")} value={employees.filter((e) => e.status === "active").length} icon={Users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { title: t("Top Profitable Workers"), rows: topWorkers },
          { title: t("Top Profitable Clients"), rows: topClients, clients: true },
        ].map((block) => (
          <Card key={block.title}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{block.title}</CardTitle>
                <Link to="/payroll/reports" className="text-xs text-primary hover:underline">{t("View report")}</Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {block.rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t("No data yet")}</p>}
              {block.rows.map((data) => (
                <div key={JSON.stringify(data.key)} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${block.clients && data.unassigned ? "italic text-muted-foreground" : ""}`}>
                      {block.clients && data.unassigned ? unassignedClientLabel : data.name || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {block.clients ? `${perCurrency(data.revenue, lang)} ${t("revenue")}` : `${data.hours.toFixed(1)}h`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-primary tabular-nums">{perCurrency(data.margin, lang)}</p>
                    <p className="text-xs text-muted-foreground">{t("profit")}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {/* Otvorene obaveze (potvrđene, sa ostatkom) — najveći ostatak, dospele prve */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("Pending Payroll")}</CardTitle>
              <Link to="/payroll/payables?status=open" className="text-xs text-primary hover:underline">{t("Manage")}</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {payroll.open.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t("No pending payments")}</p>}
            {payroll.open.slice(0, 5).map(({ payable: p, balance }) => (
              <Link key={p.id} to={`/payroll/payables?from=${p.period_start}&to=${p.period_end}&status=open`}
                className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{payeeName(p)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(parseISO(p.period_start), "d.M.yyyy", lang)} – {formatDate(parseISO(p.period_end), "d.M.yyyy", lang)}
                    {balance.overdue ? ` · ${P.overdue}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-semibold tabular-nums ${balance.overdue ? "text-destructive" : ""}`}>{money(balance.remaining, balance.currency, lang)}</span>
                  <PayableStatusBadge status={balance.status} T={P} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

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
