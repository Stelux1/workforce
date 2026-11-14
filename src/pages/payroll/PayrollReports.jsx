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
import { projectFinancials, projectSummary, timesheetTotals, totalsByClient, totalsByWorker } from "@/lib/payroll/reports";

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

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("name"),
  });

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
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

  // Zbirovi idu kroz src/lib/payroll/reports.js: radnik po employee_id, projekat po project_id, klijent po
  // project_id → projects.client_id. Ime je samo za prikaz (trenutni red po ID-u), pa preimenovanje klijenta
  // ne menja nijednu brojku. Satnice bez ID-a su posebna grupa („bez projekta / ručno uneto"), ne spajaju se po imenu.
  const unassignedProjectLabel = rs("No project / entered manually", "Bez projekta / ručno uneto");
  const unassignedClientLabel = rs("No client / entered manually", "Bez klijenta / ručno uneto");

  // „Satnica" je prosek (trošak / sati), ne tarifa prvog reda.
  const workerRows = totalsByWorker(approved).sort((a, b) => b.cost - a.cost);
  // Klijent se čita preko projekta — dok projekti i klijenti ne stignu, sve bi palo u „bez klijenta".
  const clientRows = projectsLoading || clientsLoading
    ? []
    : totalsByClient(approved, projects, clients).sort((a, b) => b.revenue - a.revenue);

  const chartData = workerRows.slice(0, 8).map((d) => ({
    name: (d.name || "—").split(" ")[0],
    cost: Math.round(d.cost),
    revenue: Math.round(d.revenue),
    profit: Math.round(d.profit),
  }));

  const totals = timesheetTotals(approved);
  const margin = totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(1) : 0;

  // ── Project Financial Report data ──
  const filteredTimesheets = selectedProject === "all"
    ? timesheets
    : timesheets.filter((ts) => ts.project_id === selectedProject);

  const filteredCosts = selectedProject === "all"
    ? costs
    : costs.filter((c) => c.project_id === selectedProject);

  const projApproved = filteredTimesheets.filter((ts) => ts.approval_status === "approved");
  // D8: ostaje nama = prihod − trošak radnika − troškovi projekta (EUR; RSD nema kurs, D2) — projectFinancials.
  const selectedFinancials = projectFinancials(projApproved, filteredCosts);
  const projRevenue = selectedFinancials.revenue;
  const projWorkerCost = selectedFinancials.workerCost;
  const projHours = selectedFinancials.hours;
  const costsEUR = selectedFinancials.costsEUR;
  const costsRSD = selectedFinancials.costsRSD;
  const grossProfit = selectedFinancials.profit;
  const projMargin = projRevenue > 0 ? (grossProfit / projRevenue * 100).toFixed(1) : 0;

  // Category breakdown
  const categoryTotals = {};
  filteredCosts.forEach((c) => {
    const key = c.category || rs("Uncategorized", "Nekategorisano");
    if (!categoryTotals[key]) categoryTotals[key] = { eur: 0, rsd: 0 };
    if ((c.currency || "EUR") === "EUR") categoryTotals[key].eur += c.amount || 0;
    else categoryTotals[key].rsd += c.amount || 0;
  });

  // Per-project summary (for "all" view) — po project_id, satnice bez projekta u posebnom redu.
  const projectRows = projectSummary({ timesheets: approved, projects, costs }).map((p) => ({
    ...p,
    margin: p.revenue > 0 ? (p.profit / p.revenue * 100).toFixed(1) : "0.0",
  }));

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
                      {projectRows.map((p) => (
                        <tr key={p.key} className="hover:bg-muted/30">
                          <td className="py-3 px-4 font-medium">
                            {p.unassigned ? (
                              <>
                                <span className="italic text-muted-foreground">{unassignedProjectLabel}</span>
                                {p.snapshotNames?.length > 0 && <p className="text-xs font-normal text-muted-foreground">{p.snapshotNames.join(", ")}</p>}
                              </>
                            ) : (p.name || "—")}
                          </td>
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
                      {projectRows.length === 0 && (
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
                    {workerRows.map((d) => (
                      <tr key={d.key} className="hover:bg-muted/30">
                        <td className="py-3 px-4 font-medium">{d.name || "—"}</td>
                        <td className="py-3 px-4 text-right">{d.hours.toFixed(1)}h</td>
                        <td className="py-3 px-4 text-right">€{d.avgRate.toFixed(2)}/h</td>
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
                    {clientRows.map((d) => (
                      <tr key={d.key} className="hover:bg-muted/30">
                        <td className="py-3 px-4 font-medium">
                          {d.unassigned ? <span className="italic text-muted-foreground">{unassignedClientLabel}</span> : (d.name || "—")}
                        </td>
                        <td className="py-3 px-4 text-right">{d.hours.toFixed(1)}h</td>
                        <td className="py-3 px-4 text-right">€{d.avgRate.toFixed(2)}/h</td>
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
                    {workerRows.map((d) => {
                      const m = d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0.0";
                      return (
                        <tr key={d.key} className="hover:bg-muted/30">
                          <td className="py-3 px-4 font-medium">{d.name || "—"}</td>
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