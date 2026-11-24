import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { parseISO } from "date-fns";
import { useT, pick } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate } from "@/lib/dateFormat";
import { TrendingUp, TrendingDown, DollarSign, Receipt, BarChart2, Clock, CalendarDays } from "lucide-react";
import { projectCostTotals, projectFinancials, projectSummary, timesheetTotals, totalsByClient, totalsByWorker } from "@/lib/payroll/reports";
import { finalPayrollTotals, monthPayrollReport, payrollRunRows, payslipContributions } from "@/lib/payroll/payrollReports";

// Iznosi mesečnog obračuna se samo formatiraju (isto kao na stranici Mesečni obračun), nikad ne računaju ponovo.
const eur = (n) => (n === null || n === undefined ? "—" : `€${Number(n).toFixed(2)}`);
const hrs = (n) => `${Number(n || 0).toFixed(1)}h`;

/**
 * Kartica „Mesečni obračun" (Faza 4, D17): sačuvani obračuni (`payroll_runs`, `payslips`, `payslip_projects`)
 * umesto starih nedeljnih zapisa (`payroll_records`). Zbirovi idu kroz src/lib/payroll/payrollReports.js
 * (`payrollTotals`/`projectTotals`), pa su brojke za mesec iste kao na stranici Mesečni obračun.
 * Izbor: nacrt se PRIKAZUJE, uvek sa oznakom „nacrt", ali ne ulazi u zbir konačnih (odobreni i isplaćeni).
 */
function MonthlyPayrollTab({ projects }) {
  const t = useT();
  const { lang } = useLang();
  const rs = (en, sr, sk) => pick(lang, en, sr, sk);
  const monthLabel = (month) => formatDate(parseISO(month), "LLLL yyyy", lang).replace(/^./, (c) => c.toUpperCase());
  const projectName = new Map((projects || []).map((p) => [p.id, p.name]));

  const runsQ = useQuery({
    queryKey: ["payroll-runs", "reports"],
    queryFn: () => base44.entities.PayrollRun.list("-month"),
    staleTime: 0,
  });
  const runs = runsQ.data || [];
  const runIds = runs.map((r) => r.id).sort();
  const slipsQ = useQuery({
    queryKey: ["payslips", "reports", runIds.join(",")],
    queryFn: () => base44.entities.Payslip.filter({ run_id: runIds }),
    enabled: runIds.length > 0,
    staleTime: 0,
  });
  const payslips = slipsQ.data || [];

  const runRows = payrollRunRows(runs, payslips);
  const finalTotals = finalPayrollTotals(runs, payslips);

  // Podrazumevano najnoviji konačan (odobren/isplaćen) mesec; ako ga nema, najnoviji nacrt.
  const [selectedRunId, setSelectedRunId] = useState(null);
  const defaultRunId = (runRows.find((r) => r.final) || runRows[0])?.runId ?? null;
  const selectedRun = runs.find((r) => r.id === selectedRunId) || runs.find((r) => r.id === defaultRunId) || null;

  // Raspodela po projektima samo za izabrani mesec — isti upit kao na stranici Mesečni obračun.
  const selectedSlipIds = payslips.filter((s) => s.run_id === selectedRun?.id).map((s) => s.id);
  const slipProjectsQ = useQuery({
    queryKey: ["payslip-projects", "reports", selectedRun?.id, selectedSlipIds.join(",")],
    queryFn: () => base44.entities.PayslipProject.filter({ payslip_id: selectedSlipIds }),
    enabled: selectedSlipIds.length > 0,
    staleTime: 0,
  });
  const report = selectedRun
    ? monthPayrollReport({ run: selectedRun, payslips, payslipProjects: slipProjectsQ.data || [] })
    : null;

  const error = runsQ.error || slipsQ.error || slipProjectsQ.error;
  const loadingRuns = runsQ.isLoading || (runIds.length > 0 && slipsQ.isLoading);
  const loadingMonth = selectedSlipIds.length > 0 && slipProjectsQ.isLoading;

  if (error) {
    return <Card className="p-6 text-sm text-red-600">{error.message}</Card>;
  }
  if (loadingRuns) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">{t("Loading...")}</Card>;
  }
  if (runRows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">{rs("No monthly payroll yet.", "Još nema mesečnog obračuna.", "Zatiaľ nie je žiadne mesačné zúčtovanie.")}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {rs("Payroll is made on the Monthly Payroll page.", "Obračun se pravi na stranici Mesečni obračun.", "Zúčtovanie sa robí na stránke Mesačné zúčtovanie miezd.")}{" "}
          <Link to="/payroll/monthly" className="text-primary hover:underline">{t("Monthly Payroll")}</Link>
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Obračuni po mesecima */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            {rs("Payroll by month", "Obračuni po mesecima", "Zúčtovania podľa mesiacov")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {rs("Saved monthly payroll (payslips) — the same numbers as on the Monthly Payroll page. Only approved and paid payrolls are final; a draft is shown marked “draft” and is not included in the total.",
              "Sačuvan mesečni obračun (platni listići) — iste brojke kao na stranici Mesečni obračun. Konačni su samo odobreni i isplaćeni obračuni; nacrt je prikazan sa oznakom „nacrt“ i ne ulazi u zbir.", "Uložené mesačné zúčtovanie (výplatné pásky) — rovnaké čísla ako na stránke Mesačné zúčtovanie miezd. Konečné sú iba schválené a vyplatené zúčtovania; koncept je označený „koncept“ a nezapočítava sa do súčtu.")}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="payroll-runs-table">
              <thead className="bg-muted/50">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left py-3 px-4">{rs("Month", "Mesec", "Mesiac")}</th>
                  <th className="text-left py-3 px-4">{t("Status")}</th>
                  <th className="text-right py-3 px-4">{t("Payslips")}</th>
                  <th className="text-right py-3 px-4">{t("Hours")}</th>
                  <th className="text-right py-3 px-4">{t("Net")}</th>
                  <th className="text-right py-3 px-4">{t("Gross")}</th>
                  <th className="text-right py-3 px-4">{t("Gross 2 (labour cost)")}</th>
                  <th className="text-right py-3 px-4">{t("To pay")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {runRows.map((r) => {
                  const selected = r.runId === selectedRun?.id;
                  return (
                    <tr key={r.runId} onClick={() => setSelectedRunId(r.runId)} aria-selected={selected}
                      className={`cursor-pointer transition-colors ${selected ? "bg-primary/5" : "hover:bg-muted/30"} ${r.draft ? "text-muted-foreground" : ""}`}>
                      <td className="py-3 px-4 font-medium">
                        {monthLabel(r.month)}
                        {r.draft && <span className="ml-2 text-xs font-normal italic text-amber-700">{rs("draft — not final", "nacrt — nije konačno", "koncept — nie je konečné")}</span>}
                      </td>
                      <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
                      <td className="py-3 px-4 text-right">{r.workers}</td>
                      <td className="py-3 px-4 text-right">{hrs(r.totals.hours)}</td>
                      <td className="py-3 px-4 text-right">{eur(r.totals.neto)}</td>
                      <td className="py-3 px-4 text-right">{eur(r.totals.bruto)}</td>
                      <td className="py-3 px-4 text-right">{eur(r.totals.totalCost)}</td>
                      <td className="py-3 px-4 text-right font-semibold">{eur(r.totals.payout)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="py-3 px-4" colSpan={2}>
                    {rs(`Total — approved and paid (months: ${finalTotals.months})`, `Ukupno — odobreni i isplaćeni (meseci: ${finalTotals.months})`, `Spolu — schválené a vyplatené (mesiacov: ${finalTotals.months})`)}
                  </td>
                  <td className="py-3 px-4 text-right">{finalTotals.workers}</td>
                  <td className="py-3 px-4 text-right">{hrs(finalTotals.totals.hours)}</td>
                  <td className="py-3 px-4 text-right">{eur(finalTotals.totals.neto)}</td>
                  <td className="py-3 px-4 text-right">{eur(finalTotals.totals.bruto)}</td>
                  <td className="py-3 px-4 text-right">{eur(finalTotals.totals.totalCost)}</td>
                  <td className="py-3 px-4 text-right">{eur(finalTotals.totals.payout)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Izabrani mesec: radnici i raspodela troška po projektima */}
      {report && (
        <Card data-testid="payroll-month-report">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={report.runId} onValueChange={setSelectedRunId}>
                <SelectTrigger className="w-56" aria-label={rs("Month", "Mesec", "Mesiac")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {runRows.map((r) => (
                    <SelectItem key={r.runId} value={r.runId}>
                      {monthLabel(r.month)}{r.draft ? ` · ${rs("draft", "nacrt", "koncept")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <StatusBadge status={report.status} />
              <Link to={`/payroll/monthly?month=${report.month.slice(0, 7)}`} className="text-xs text-primary hover:underline ml-auto">
                {rs("Open in Monthly Payroll", "Otvori u Mesečnom obračunu", "Otvoriť v mesačnom zúčtovaní")}
              </Link>
            </div>
            {report.draft && (
              <p className="text-xs text-amber-700">
                {rs("Draft — not final: the numbers can change until the payroll is approved.",
                  "Nacrt — nije konačno: brojke mogu da se promene dok se obračun ne odobri.", "Koncept — nie je konečné: čísla sa môžu zmeniť, kým sa zúčtovanie neschváli.")}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingMonth ? (
              <p className="text-center py-8 text-sm text-muted-foreground">{t("Loading...")}</p>
            ) : report.payslips.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">{t("No payroll for this month")}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: t("Total Hours"), value: hrs(report.totals.hours) },
                    { label: t("To pay"), value: eur(report.totals.payout) },
                    { label: t("Gross 2 (labour cost)"), value: eur(report.totals.totalCost) },
                    { label: t("Client Revenue"), value: eur(report.totals.revenue) },
                  ].map((item) => (
                    <Card key={item.label} className="p-4">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-xl font-bold mt-1">{item.value}</p>
                    </Card>
                  ))}
                </div>

                <div>
                  <h3 className="font-semibold text-sm mb-2">{t("Payslips")}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="report-payslips-table">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="text-left py-2 pr-4">{t("Employee")}</th>
                          <th className="text-left py-2 pr-4">{t("Engagement")}</th>
                          <th className="text-right py-2 pr-4">{t("Hours")}</th>
                          <th className="text-right py-2 pr-4">{t("Net")}</th>
                          <th className="text-right py-2 pr-4">{t("Tax")}</th>
                          <th className="text-right py-2 pr-4">{t("Employee contributions")}</th>
                          <th className="text-right py-2 pr-4">{t("Gross")}</th>
                          <th className="text-right py-2 pr-4">{t("Employer contributions")}</th>
                          <th className="text-right py-2 pr-4">{t("Gross 2 (labour cost)")}</th>
                          <th className="text-right py-2">{t("To pay")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {report.payslips.map((s) => {
                          const c = payslipContributions(s);
                          return (
                            <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                              <td className="py-3 pr-4 font-medium">{s.employee_name}</td>
                              <td className="py-3 pr-4 text-xs text-muted-foreground">
                                {s.engagement_type === "subcontractor_worker" ? t("Subcontractor") : t("Employee (direct)")}
                              </td>
                              <td className="py-3 pr-4 text-right">{hrs(s.total_hours)}</td>
                              <td className="py-3 pr-4 text-right">{eur(s.neto)}</td>
                              <td className="py-3 pr-4 text-right">{eur(s.tax)}</td>
                              <td className="py-3 pr-4 text-right">{eur(c.employee)}</td>
                              <td className="py-3 pr-4 text-right">{eur(s.bruto)}</td>
                              <td className="py-3 pr-4 text-right">{eur(c.employer)}</td>
                              <td className="py-3 pr-4 text-right font-medium">{eur(s.total_cost)}</td>
                              <td className="py-3 text-right text-emerald-600 font-medium">{eur(s.payout)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-semibold">
                          <td className="py-3 pr-4" colSpan={2}>{t("Total")}</td>
                          <td className="py-3 pr-4 text-right">{hrs(report.totals.hours)}</td>
                          <td className="py-3 pr-4 text-right">{eur(report.totals.neto)}</td>
                          <td className="py-3 pr-4 text-right">{eur(report.totals.tax)}</td>
                          <td className="py-3 pr-4 text-right">{eur(report.totals.employeeContributions)}</td>
                          <td className="py-3 pr-4 text-right">{eur(report.totals.bruto)}</td>
                          <td className="py-3 pr-4 text-right">{eur(report.totals.employerContributions)}</td>
                          <td className="py-3 pr-4 text-right">{eur(report.totals.totalCost)}</td>
                          <td className="py-3 text-right">{eur(report.totals.payout)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-sm mb-2">{t("Cost per project")}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="report-projects-table">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="text-left py-2 pr-4">{t("Project")}</th>
                          <th className="text-right py-2 pr-4">{t("Hours")}</th>
                          <th className="text-right py-2 pr-4">{t("Worker earnings")}</th>
                          <th className="text-right py-2 pr-4">{t("Labour cost")}</th>
                          <th className="text-right py-2 pr-4">{t("Client Revenue")}</th>
                          <th className="text-right py-2">{t("Difference")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {report.projects.map((p) => (
                          <tr key={p.project_id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 pr-4 font-medium">{projectName.get(p.project_id) || p.project_id}</td>
                            <td className="py-3 pr-4 text-right">{hrs(p.hours)}</td>
                            <td className="py-3 pr-4 text-right">{eur(p.worker_amount)}</td>
                            <td className="py-3 pr-4 text-right">{eur(p.labor_cost)}</td>
                            <td className="py-3 pr-4 text-right">{eur(p.revenue)}</td>
                            <td className={`py-3 text-right font-medium ${p.difference < 0 ? "text-red-600" : "text-emerald-600"}`}>{eur(p.difference)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-semibold">
                          <td className="py-3 pr-4">{t("Total")}</td>
                          <td className="py-3 pr-4 text-right">{hrs(report.totals.hours)}</td>
                          <td className="py-3 pr-4 text-right">{eur(report.totals.basis)}</td>
                          <td className="py-3 pr-4 text-right">{eur(report.totals.allocated)}</td>
                          <td className="py-3 pr-4 text-right">{eur(report.totals.revenue)}</td>
                          <td className="py-3 text-right">{eur(report.totals.difference)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className={`text-xs mt-3 ${report.allocationOk ? "text-muted-foreground" : "text-red-600 font-medium"}`}>
                    {report.allocationOk
                      ? rs(`Sum of cost per project ${eur(report.totals.allocated)} = sum of gross 2 ${eur(report.totals.totalCost)}. Project costs (materials etc.) are not included.`,
                        `Zbir troška po projektima ${eur(report.totals.allocated)} = zbir bruto 2 ${eur(report.totals.totalCost)}. Ostali troškovi projekta (materijal i sl.) nisu uključeni.`, `Súčet nákladov podľa projektov ${eur(report.totals.allocated)} = súčet hrubej 2 ${eur(report.totals.totalCost)}. Náklady projektov (materiál a pod.) nie sú zahrnuté.`)
                      : rs(`Sum of cost per project ${eur(report.totals.allocated)} ≠ sum of gross 2 ${eur(report.totals.totalCost)}`,
                        `Zbir troška po projektima ${eur(report.totals.allocated)} ≠ zbir bruto 2 ${eur(report.totals.totalCost)}`, `Súčet nákladov podľa projektov ${eur(report.totals.allocated)} ≠ súčet hrubej 2 ${eur(report.totals.totalCost)}`)}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PayrollReports() {
  const t = useT();
  const { lang } = useLang();
  const rs = (en, sr, sk) => pick(lang, en, sr, sk);

  const [selectedProject, setSelectedProject] = useState("all");

  // Sve odobrene satnice (bez gornje granice — sloj podataka čita u delovima) i veze po ID-u (QA 14.11.2026).
  const { data: timesheets = [] } = useQuery({
    queryKey: ["timesheets", "approved"],
    queryFn: () => base44.entities.Timesheet.filter({ approval_status: "approved" }, "-week_start"),
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
  const unassignedProjectLabel = rs("No project / entered manually", "Bez projekta / ručno uneto", "Bez projektu / zadané ručne");
  const unassignedClientLabel = rs("No client / entered manually", "Bez klijenta / ručno uneto", "Bez klienta / zadané ručne");
  // Kartice po satnicama nisu plata (D20): trošak je iznos sati iz odobrenih satnica, bez poreza i doprinosa.
  const timesheetCostNote = rs(
    "From approved timesheets: hours × worker rate, without tax and contributions — not the salary. Net, gross and gross 2 are on the Monthly Payroll tab.",
    "Iz odobrenih satnica: sati × satnica radnika, bez poreza i doprinosa — nije plata. Neto, bruto i bruto 2 su na kartici Mesečni obračun.", "Zo schválených výkazov: hodiny × sadzba zamestnanca, bez dane a odvodov — nie je to mzda. Čistá, hrubá a hrubá 2 sú na karte Mesačné zúčtovanie miezd."
  );

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
  // D8: ostaje nama = prihod − trošak radnika − troškovi projekta u EUR (RSD po kursu uz trošak, D19) — projectFinancials.
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
  // Po kategoriji: EUR (sa preračunatim RSD) i RSD bez kursa, isti zbir kao gore (projectCostTotals).
  const costsByCategory = {};
  filteredCosts.forEach((c) => {
    const key = c.category || rs("Uncategorized", "Nekategorisano", "Bez kategórie");
    (costsByCategory[key] ||= []).push(c);
  });
  for (const [key, list] of Object.entries(costsByCategory)) categoryTotals[key] = projectCostTotals(list);

  // Per-project summary (for "all" view) — po project_id, satnice bez projekta u posebnom redu.
  const projectRows = projectSummary({ timesheets: approved, projects, costs }).map((p) => ({
    ...p,
    margin: p.revenue > 0 ? (p.profit / p.revenue * 100).toFixed(1) : "0.0",
  }));

  const getCategoryLabel = (key) => {
    const found = costCategories.find((c) => c.name.toLowerCase() === key?.toLowerCase());
    if (found) return found.name;
    return key;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("Payroll Reports")} subtitle={t("Financial analysis and insights")} />

      <Tabs defaultValue="projects">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="projects">{rs("Project Reports", "Izveštaji projekata", "Prehľady projektov")}</TabsTrigger>
          {/* Satnice, ne plata: trošak = sati × satnica radnika, bez poreza i doprinosa. Plate su na kartici „Mesečni obračun". */}
          <TabsTrigger value="workers">{rs("Worker cost (timesheets)", "Trošak radnika (satnice)", "Náklady na zamestnanca (hárky)")}</TabsTrigger>
          <TabsTrigger value="clients">{t("Client Billing")}</TabsTrigger>
          <TabsTrigger value="profit">{t("Profit Report")}</TabsTrigger>
          <TabsTrigger value="monthly">{t("Monthly Payroll")}</TabsTrigger>
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
                <SelectItem value="all">{rs("All projects", "Svi projekti", "Všetky projekty")}</SelectItem>
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
                  {rs("All projects overview", "Pregled svih projekata", "Prehľad všetkých projektov")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-xs text-muted-foreground">
                        <th className="text-left py-3 px-4">{rs("Project", "Projekat", "Projekt")}</th>
                        <th className="text-right py-3 px-4">{rs("Hours", "Sati", "Hodiny")}</th>
                        <th className="text-right py-3 px-4">{rs("Revenue (B2B)", "Prihod (B2B)", "Tržby (B2B)")}</th>
                        <th className="text-right py-3 px-4">{rs("Worker cost", "Troš. radnika", "Náklady na zamestnanca")}</th>
                        <th className="text-right py-3 px-4">{rs("Project costs", "Proj. troškovi", "Náklady projektu")}</th>
                        <th className="text-right py-3 px-4">{rs("Remaining", "Ostaje nama", "Zostáva nám")}</th>
                        <th className="text-right py-3 px-4">{rs("Margin", "Marža", "Rozpätie")}</th>
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
                        <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">{rs("No data", "Nema podataka", "Žiadne údaje")}</td></tr>
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
                      <p className="text-xs text-muted-foreground mb-0.5">{rs("Revenue (B2B)", "Prihod (B2B)", "Tržby (B2B)")}</p>
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
                      <p className="text-xs text-muted-foreground mb-0.5">{rs("Worker costs", "Troškovi radnika", "Náklady na zamestnancov")}</p>
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
                      <p className="text-xs text-muted-foreground mb-0.5">{rs("Project costs", "Projektni troškovi", "Náklady projektu")}</p>
                      {costsEUR > 0 && <p className="text-base font-bold text-red-600">{costsEUR.toFixed(2)} €</p>}
                      {costsRSD > 0 && <p className="text-xs text-amber-600">{costsRSD.toFixed(2)} RSD {rs("without exchange rate (not included)", "bez kursa (nije uračunato)", "bez kurzu (nezapočítané)")}</p>}
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
                      <p className="text-xs text-muted-foreground mb-0.5">{rs("Remaining", "Ostaje nama", "Zostáva nám")}</p>
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
                    <h3 className="font-semibold text-sm">{rs("Hours summary", "Pregled sati", "Prehľad hodín")}</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-primary">{projHours.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">{rs("Total hours", "Ukupno sati", "Hodiny spolu")}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{projApproved.length}</p>
                      <p className="text-xs text-muted-foreground">{rs("Entries", "Unosa", "Záznamov")}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {projHours > 0 ? (projRevenue / projHours).toFixed(2) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{rs("Avg €/h (B2B)", "Prosek €/h (B2B)", "Priemer €/h (B2B)")}</p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Cost breakdown */}
              {filteredCosts.length > 0 && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Receipt className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-sm">{rs("Costs by category", "Troškovi po kategoriji", "Náklady podľa kategórií")}</h3>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(categoryTotals).map(([cat, vals]) => (
                      <div key={cat} className="flex items-center justify-between py-2 border-b last:border-0">
                        <span className="text-sm font-medium">{getCategoryLabel(cat)}</span>
                        <div className="text-right">
                          {vals.eur > 0 && <span className="text-sm font-semibold text-primary">{vals.eur.toFixed(2)} €</span>}
                          {vals.eur > 0 && vals.rsd > 0 && <span className="text-sm text-muted-foreground mx-1">·</span>}
                          {vals.rsd > 0 && <span className="text-sm font-semibold text-amber-600">{vals.rsd.toFixed(2)} RSD {rs("without rate", "bez kursa", "bez kurzu")}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {projRevenue === 0 && filteredCosts.length === 0 && (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground text-sm">{rs("No financial data for this project.", "Nema finansijskih podataka za ovaj projekat.", "Pre tento projekt nie sú finančné údaje.")}</p>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── WORKER PAYROLL TAB ── */}
        <TabsContent value="workers" className="mt-4">
          <p className="text-xs text-muted-foreground mb-4">{timesheetCostNote}</p>
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
                  <Bar dataKey="revenue" name="Client Revenue" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
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
                      <th className="text-right py-3 px-4">{rs("Avg. hourly rate", "Prosečna satnica", "Priemerná hodinová sadzba")}</th>
                      <th className="text-right py-3 px-4">{rs("Cost by timesheets", "Trošak po satnicama", "Náklady podľa výkazov")}</th>
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
                      <th className="text-right py-3 px-4">{rs("Avg. B2B rate", "Prosečna B2B satnica", "Priemerná sadzba B2B")}</th>
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
          <p className="text-xs text-muted-foreground mb-4">{timesheetCostNote}</p>
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

        {/* ── MESEČNI OBRAČUN (payslips; zamenjuje stari nedeljni PayrollRecord) ── */}
        <TabsContent value="monthly" className="mt-4">
          <MonthlyPayrollTab projects={projects} />
        </TabsContent>
      </Tabs>
    </div>
  );
}