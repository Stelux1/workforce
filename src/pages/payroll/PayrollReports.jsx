import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { parseISO } from "date-fns";
import { useT, pick } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { pageTitle } from "@/lib/pageTitles";
import { formatDate } from "@/lib/dateFormat";
import { CalendarDays, Lock } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import FinancialReportPanel from "@/components/reports/FinancialReportPanel";
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

// Financial Reports (spec §10): menadžerska profitabilnost po valuti iz jednog obračunskog servisa (financialSummary),
// sa filterima Project/Client/period/Employee/Job Role/Cost Category i izvozom PDF/CSV. Ranije kartice po satnicama
// (zbir redova u „€", mešanje valuta) su zamenjene istim izveštajem. Srpski mesečni obračun (neto/bruto/bruto 2) ostaje
// na posebnoj kartici — bruto 2 nije Payroll Cost projekta (D30 K4).
export default function PayrollReports() {
  const t = useT();
  const { lang } = useLang();
  const rs = (en, sr, sk) => pick(lang, en, sr, sk);
  const { can } = useAuth();
  const canFinancial = can("reports.financial");
  const canPayroll = can("payroll.view");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("name"),
    enabled: canPayroll,
  });

  const denied = (
    <Card className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
      <Lock className="w-4 h-4" />{rs("You do not have permission to see financial reports.", "Nemate pravo da vidite finansijske izveštaje.", "Nemáte oprávnenie vidieť finančné prehľady.")}
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={pageTitle("Payroll Reports", lang)}
        subtitle={rs("Managerial profitability by currency — internal calculation, separate from invoiced amounts, client payments and payouts.",
          "Menadžerska profitabilnost po valuti — interni obračun, odvojeno od fakturisanog, uplata klijenata i isplata.",
          "Manažérska ziskovosť podľa meny — interný výpočet, oddelene od fakturovaného, platieb klientov a výplat.")} />

      <Tabs defaultValue={canFinancial ? "financial" : "monthly"}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="financial">{rs("Financial Report", "Finansijski izveštaj", "Finančný prehľad")}</TabsTrigger>
          {canPayroll && <TabsTrigger value="monthly">{t("Monthly Payroll")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="financial" className="mt-4">
          {canFinancial ? <FinancialReportPanel /> : denied}
        </TabsContent>

        {/* ── MESEČNI OBRAČUN (payslips; srpski neto/bruto/bruto 2 — nije trošak projekta, K4) ── */}
        {canPayroll && (
          <TabsContent value="monthly" className="mt-4">
            <MonthlyPayrollTab projects={projects} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
