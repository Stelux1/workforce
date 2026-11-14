import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { parseISO } from "date-fns";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate, shortDatePattern, longDatePattern } from "@/lib/dateFormat";
import { TrendingUp, TrendingDown, DollarSign, Receipt, BarChart2, Clock } from "lucide-react";
import { projectMargin } from "@/lib/payroll/monthly";

export default function PayrollReports() {
  const t = useT();
  const { lang } = useLang();
  const rs = (en, sr) => lang === "rs" ? sr : en;

  const [selectedProject, setSelectedProject] = useState("all");

  // Sve odobrene satnice (bez gornje granice — sloj podataka čita u delovima) i veze po ID-u (QA 14.11.2026).
  const { data: timesheets = [] } = useQuery({
    queryKey: ["timesheets", "approved"],
    queryFn: () => base44.entities.Timesheet.filter({ approval_status: "approved" }, "-week_start"),
  });

  const { data: payrollRecords = [] } = useQuery({
    queryKey: ["payroll-records"],
    queryFn: () => base44.entities.PayrollRecord.list("-week_start"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("name"),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list("name"),
  });

  const { data: costs = [] } = useQuery({
    queryKey: ["project-costs-all"],
    queryFn: () => base44.entities.ProjectCost.list("-created_date"),
  });

  const { data: costCategories = [] } = useQuery({
    queryKey: ["cost-categories"],
    queryFn: () => base44.entities.CostCategory.list("name", 200),
  });

  // ── Payroll tab data (approved timesheets, no project filter) ──
  const approved = timesheets.filter((ts) => ts.approval_status === "approved");

  // Grupisanje po ID-u radnika; „satnica" je prosek (trošak / sati), ne tarifa prvog reda.
  const workerData = {};
  approved.forEach((ts) => {
    const key = ts.employee_id || ts.employee_name;
    if (!workerData[key]) workerData[key] = { name: ts.employee_name, hours: 0, cost: 0, revenue: 0, profit: 0 };
    workerData[key].hours += ts.total_hours || 0;
    workerData[key].cost += ts.worker_cost || 0;
    workerData[key].revenue += ts.client_revenue || 0;
    workerData[key].profit += ts.profit || 0;
  });
  Object.values(workerData).forEach((d) => { d.rate = d.hours > 0 ? d.cost / d.hours : 0; });
  const workerRows = Object.values(workerData).map((d) => [d.name, d]).sort((a, b) => b[1].cost - a[1].cost);

  // Klijent po projektu satnice (project_id → client_id), sa trenutnim nazivom klijenta.
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const clientName = (id) => clients.find((c) => c.id === id)?.name;
  const clientData = {};
  approved.forEach((ts) => {
    const proj = projectById[ts.project_id];
    const key = proj?.client_id || ts.client_name;
    if (!key) return;
    if (!clientData[key]) clientData[key] = { name: clientName(proj?.client_id) || proj?.client_name || ts.client_name, hours: 0, revenue: 0, cost: 0, profit: 0 };
    clientData[key].hours += ts.total_hours || 0;
    clientData[key].revenue += ts.client_revenue || 0;
    clientData[key].cost += ts.worker_cost || 0;
    clientData[key].profit += ts.profit || 0;
  });
  Object.values(clientData).forEach((d) => { d.rate = d.hours > 0 ? d.revenue / d.hours : 0; });
  const clientRows = Object.values(clientData).map((d) => [d.name, d]).sort((a, b) => b[1].revenue - a[1].revenue);

  const chartData = workerRows.slice(0, 8).map(([name, d]) => ({
    name: name.split(" ")[0],
    cost: Math.round(d.cost),
    revenue: Math.round(d.revenue),
    profit: Math.round(d.profit),
  }));

  const totals = approved.reduce((acc, ts) => ({
    hours: acc.hours + (ts.total_hours || 0),
    cost: acc.cost + (ts.worker_cost || 0),
    revenue: acc.revenue + (ts.client_revenue || 0),
    profit: acc.profit + (ts.profit || 0),
  }), { hours: 0, cost: 0, revenue: 0, profit: 0 });
  const margin = totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(1) : 0;

  // ── Project Financial Report data ──
  const filteredTimesheets = selectedProject === "all"
    ? timesheets
    : timesheets.filter((ts) => ts.project_id === selectedProject);

  const filteredCosts = selectedProject === "all"
    ? costs
    : costs.filter((c) => c.project_id === selectedProject);

  const projApproved = filteredTimesheets.filter((ts) => ts.approval_status === "approved");
  const projRevenue = projApproved.reduce((s, ts) => s + (ts.client_revenue || 0), 0);
  const projWorkerCost = projApproved.reduce((s, ts) => s + (ts.worker_cost || 0), 0);
  const projHours = projApproved.reduce((s, ts) => s + (ts.total_hours || 0), 0);
  const costsEUR = filteredCosts.filter(c => (c.currency || "EUR") === "EUR").reduce((s, c) => s + (c.amount || 0), 0);
  const costsRSD = filteredCosts.filter(c => c.currency === "RSD").reduce((s, c) => s + (c.amount || 0), 0);
  // D8: ostaje nama = prihod − trošak radnika − troškovi projekta (EUR; RSD nema kurs, D2).
  const grossProfit = projectMargin({ revenue: projRevenue, laborCost: projWorkerCost, otherCosts: costsEUR }).remaining;
  const projMargin = projRevenue > 0 ? (grossProfit / projRevenue * 100).toFixed(1) : 0;

  // Category breakdown
  const categoryTotals = {};
  filteredCosts.forEach((c) => {
    const key = c.category || rs("Uncategorized", "Nekategorisano");
    if (!categoryTotals[key]) categoryTotals[key] = { eur: 0, rsd: 0 };
    if ((c.currency || "EUR") === "EUR") categoryTotals[key].eur += c.amount || 0;
    else categoryTotals[key].rsd += c.amount || 0;
  });

  // Per-project summary (for "all" view)
  const projectSummary = projects.map((proj) => {
    const pts = timesheets.filter((ts) => ts.project_id === proj.id && ts.approval_status === "approved");
    const pcs = costs.filter((c) => c.project_id === proj.id);
    const rev = pts.reduce((s, ts) => s + (ts.client_revenue || 0), 0);
    const wc = pts.reduce((s, ts) => s + (ts.worker_cost || 0), 0);
    const hrs = pts.reduce((s, ts) => s + (ts.total_hours || 0), 0);
    const cEUR = pcs.filter(c => (c.currency || "EUR") === "EUR").reduce((s, c) => s + (c.amount || 0), 0);
    const profit = projectMargin({ revenue: rev, laborCost: wc, otherCosts: cEUR }).remaining;
    const m = rev > 0 ? (profit / rev * 100).toFixed(1) : "0.0";
    return { id: proj.id, name: proj.name, hours: hrs, revenue: rev, workerCost: wc, costsEUR: cEUR, profit, margin: m };
  }).filter(p => p.hours > 0 || p.costsEUR > 0).sort((a, b) => b.revenue - a.revenue);

  const getCategoryLabel = (key) => {
    const found = costCategories.find((c) => c.name.toLowerCase() === key?.toLowerCase());
    if (found) return lang === "rs" ? (found.translation || found.name) : found.name;
    return key;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("Payroll Reports")} subtitle={t("Financial analysis and insights")} />

      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">{rs("Project Reports", "Izveštaji projekata")}</TabsTrigger>
          <TabsTrigger value="workers">{t("Worker Payroll")}</TabsTrigger>
          <TabsTrigger value="clients">{t("Client Billing")}</TabsTrigger>
          <TabsTrigger value="profit">{t("Profit Report")}</TabsTrigger>
          <TabsTrigger value="weekly">{t("Weekly Summary")}</TabsTrigger>
        </TabsList>

        {/* ── PROJECT FINANCIAL REPORT TAB ── */}
        <TabsContent value="projects" className="mt-4 space-y-6">
          {/* Project filter */}
          <div className="flex items-center gap-3">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{rs("All projects", "Svi projekti")}</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.project_number ? `[${p.project_number}] ${p.name}` : p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProject === "all" ? (
            /* Summary table for all projects */
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  {rs("All projects overview", "Pregled svih projekata")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-xs text-muted-foreground">
                        <th className="text-left py-3 px-4">{rs("Project", "Projekat")}</th>
                        <th className="text-right py-3 px-4">{rs("Hours", "Sati")}</th>
                        <th className="text-right py-3 px-4">{rs("Revenue (B2B)", "Prihod (B2B)")}</th>
                        <th className="text-right py-3 px-4">{rs("Worker cost", "Troš. radnika")}</th>
                        <th className="text-right py-3 px-4">{rs("Project costs", "Proj. troškovi")}</th>
                        <th className="text-right py-3 px-4">{rs("Remaining", "Ostaje nama")}</th>
                        <th className="text-right py-3 px-4">{rs("Margin", "Marža")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {projectSummary.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="py-3 px-4 font-medium">{p.name}</td>
                          <td className="py-3 px-4 text-right text-muted-foreground">{p.hours.toFixed(1)}h</td>
                          <td className="py-3 px-4 text-right text-green-600 font-semibold">€{p.revenue.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-orange-600">€{p.workerCost.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-red-500">€{p.costsEUR.toFixed(2)}</td>
                          <td className={`py-3 px-4 text-right font-bold ${p.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            €{p.profit.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right text-muted-foreground">{p.margin}%</td>
                        </tr>
                      ))}
                      {projectSummary.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">{rs("No data", "Nema podataka")}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Detailed view for a single project */
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">{rs("Revenue (B2B)", "Prihod (B2B)")}</p>
                      <p className="text-lg font-bold text-green-600">{projRevenue.toFixed(2)} €</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                      <TrendingDown className="w-4 h-4 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">{rs("Worker costs", "Troškovi radnika")}</p>
                      <p className="text-lg font-bold text-orange-600">{projWorkerCost.toFixed(2)} €</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">{rs("Project costs", "Projektni troškovi")}</p>
                      {costsEUR > 0 && <p className="text-base font-bold text-red-600">{costsEUR.toFixed(2)} €</p>}
                      {costsRSD > 0 && <p className="text-sm font-semibold text-red-500">{costsRSD.toFixed(2)} RSD</p>}
                      {costsEUR === 0 && costsRSD === 0 && <p className="text-base font-bold text-muted-foreground">—</p>}
                    </div>
                  </div>
                </Card>
                <Card className={`p-4 ${grossProfit >= 0 ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${grossProfit >= 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                      <DollarSign className={`w-4 h-4 ${grossProfit >= 0 ? "text-green-600" : "text-red-600"}`} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">{rs("Remaining", "Ostaje nama")}</p>
                      <p className={`text-lg font-bold ${grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{grossProfit.toFixed(2)} €</p>
                      {projRevenue > 0 && <p className="text-xs text-muted-foreground">{projMargin}%</p>}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Hours summary */}
              {projHours > 0 && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-sm">{rs("Hours summary", "Pregled sati")}</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-primary">{projHours.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">{rs("Total hours", "Ukupno sati")}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{projApproved.length}</p>
                      <p className="text-xs text-muted-foreground">{rs("Entries", "Unosa")}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {projHours > 0 ? (projRevenue / projHours).toFixed(2) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{rs("Avg €/h (B2B)", "Prosek €/h (B2B)")}</p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Cost breakdown */}
              {filteredCosts.length > 0 && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Receipt className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-sm">{rs("Costs by category", "Troškovi po kategoriji")}</h3>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(categoryTotals).map(([cat, vals]) => (
                      <div key={cat} className="flex items-center justify-between py-2 border-b last:border-0">
                        <span className="text-sm font-medium">{getCategoryLabel(cat)}</span>
                        <div className="text-right">
                          {vals.eur > 0 && <span className="text-sm font-semibold text-primary">{vals.eur.toFixed(2)} €</span>}
                          {vals.eur > 0 && vals.rsd > 0 && <span className="text-sm text-muted-foreground mx-1">·</span>}
                          {vals.rsd > 0 && <span className="text-sm font-semibold text-amber-600">{vals.rsd.toFixed(2)} RSD</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {projRevenue === 0 && filteredCosts.length === 0 && (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground text-sm">{rs("No financial data for this project.", "Nema finansijskih podataka za ovaj projekat.")}</p>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── WORKER PAYROLL TAB ── */}
        <TabsContent value="workers" className="mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[
              { label: t("Total Hours"), value: totals.hours.toFixed(1) + "h" },
              { label: t("Worker Cost"), value: "€" + totals.cost.toLocaleString("en", { maximumFractionDigits: 0 }) },
              { label: t("Client Revenue"), value: "€" + totals.revenue.toLocaleString("en", { maximumFractionDigits: 0 }) },
              { label: t("Net Profit"), value: "€" + totals.profit.toLocaleString("en", { maximumFractionDigits: 0 }) },
              { label: t("Profit Margin"), value: margin + "%" },
            ].map((item) => (
              <Card key={item.label} className="p-4">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-lg font-bold mt-1">{item.value}</p>
              </Card>
            ))}
          </div>
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-base">{t("Cost vs Revenue vs Profit by Worker")}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `€${v}`} />
                  <Bar dataKey="cost" name="Worker Cost" fill="hsl(0,72%,51%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="revenue" name="Client Revenue" fill="hsl(38,32%,55%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="profit" name="Profit" fill="hsl(142,72%,40%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left py-3 px-4">{t("Employee")}</th>
                      <th className="text-right py-3 px-4">{t("Hours")}</th>
                      <th className="text-right py-3 px-4">{rs("Avg. hourly rate", "Prosečna satnica")}</th>
                      <th className="text-right py-3 px-4">{t("Total Salary")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {workerRows.map(([name, d]) => (
                      <tr key={name} className="hover:bg-muted/30">
                        <td className="py-3 px-4 font-medium">{name}</td>
                        <td className="py-3 px-4 text-right">{d.hours.toFixed(1)}h</td>
                        <td className="py-3 px-4 text-right">€{d.rate?.toFixed(2)}/h</td>
                        <td className="py-3 px-4 text-right font-semibold">€{d.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                    {workerRows.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">{t("No data")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CLIENT BILLING TAB ── */}
        <TabsContent value="clients" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left py-3 px-4">{t("Client")}</th>
                      <th className="text-right py-3 px-4">{t("Billable Hours")}</th>
                      <th className="text-right py-3 px-4">{rs("Avg. B2B rate", "Prosečna B2B satnica")}</th>
                      <th className="text-right py-3 px-4">{t("Invoice Total")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {clientRows.map(([name, d]) => (
                      <tr key={name} className="hover:bg-muted/30">
                        <td className="py-3 px-4 font-medium">{name}</td>
                        <td className="py-3 px-4 text-right">{d.hours.toFixed(1)}h</td>
                        <td className="py-3 px-4 text-right">€{d.rate?.toFixed(2)}/h</td>
                        <td className="py-3 px-4 text-right font-semibold">€{d.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                    {clientRows.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">{t("No data")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PROFIT TAB ── */}
        <TabsContent value="profit" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left py-3 px-4">{t("Worker")}</th>
                      <th className="text-right py-3 px-4">{t("Worker Cost")}</th>
                      <th className="text-right py-3 px-4">{t("Client Revenue")}</th>
                      <th className="text-right py-3 px-4">{t("Net Profit")}</th>
                      <th className="text-right py-3 px-4">{t("Profit Margin")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {workerRows.map(([name, d]) => {
                      const m = d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0.0";
                      return (
                        <tr key={name} className="hover:bg-muted/30">
                          <td className="py-3 px-4 font-medium">{name}</td>
                          <td className="py-3 px-4 text-right">€{d.cost.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right">€{d.revenue.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-emerald-600 font-semibold">€{d.profit.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right">{m}%</td>
                        </tr>
                      );
                    })}
                    {workerRows.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">{t("No data")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WEEKLY SUMMARY TAB ── */}
        <TabsContent value="weekly" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left py-3 px-4">{t("Employee")}</th>
                      <th className="text-left py-3 px-4">{t("Week")}</th>
                      <th className="text-right py-3 px-4">{t("Hours")}</th>
                      <th className="text-right py-3 px-4">{t("Payroll")}</th>
                      <th className="text-right py-3 px-4">{t("Revenue")}</th>
                      <th className="text-right py-3 px-4">{t("Profit")}</th>
                      <th className="text-right py-3 px-4">{t("Status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {payrollRecords.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="py-3 px-4 font-medium">{p.employee_name}</td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">{p.week_start && formatDate(parseISO(p.week_start), shortDatePattern(lang), lang)} – {p.week_end && formatDate(parseISO(p.week_end), shortDatePattern(lang), lang)}</td>
                        <td className="py-3 px-4 text-right">{p.total_hours?.toFixed(1)}h</td>
                        <td className="py-3 px-4 text-right">€{(p.total_worker_cost || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right">€{(p.total_client_revenue || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-emerald-600">€{(p.total_profit || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right"><StatusBadge status={p.payment_status} /></td>
                      </tr>
                    ))}
                    {payrollRecords.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">{t("No payroll records")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}