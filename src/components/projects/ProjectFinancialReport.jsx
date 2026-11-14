import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, DollarSign, Receipt, BarChart2, Users, CalendarDays, AlertTriangle } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import { useLang } from "@/lib/LanguageContext";
import { formatDate } from "@/lib/dateFormat";
import { sumCostsEur } from "@/lib/payroll/costs";
import { FINAL_RUN_STATUSES, projectFinancialReport, reportProblemMessage } from "@/lib/payroll/projectReport";

// Finansijski izveštaj projekta (Faza 4, D8): sve brojke računa src/lib/payroll/projectReport.js — ovde samo prikaz.
// Satnice, troškovi i obračun se čitaju po ID-u projekta, pa preimenovanje projekta ne menja nijednu brojku.
export default function ProjectFinancialReport({ project }) {
  const { lang } = useLang();
  const t = (en, rs) => lang === "rs" ? rs : en;

  // Po ID-u projekta (ne po imenu) i sve satnice — odobrene ulaze u novac, ostale se samo prikazuju (QA 14.11.2026).
  const { data: allTimesheets = [], isLoading: loadingTS } = useQuery({
    queryKey: ["timesheets", "project", project.id],
    queryFn: () => base44.entities.Timesheet.filter({ project_id: project.id }, "-week_start"),
  });

  const { data: costs = [], isLoading: loadingCosts } = useQuery({
    queryKey: ["project-costs", project.id],
    queryFn: () => base44.entities.ProjectCost.filter({ project_id: project.id }, "-created_date"),
  });

  const { data: costCategories = [] } = useQuery({
    queryKey: ["cost-categories"],
    queryFn: () => base44.entities.CostCategory.list("name", 200),
  });

  // Mesečni obračun (samo admin, RLS): status po mesecu i bruto 2 raspodeljen na ovaj projekat. Status obračuna se
  // menja na drugoj stranici, pa se ovi podaci uvek osvežavaju pri otvaranju (staleTime 0).
  const { data: runs = [], isLoading: loadingRuns } = useQuery({
    queryKey: ["payroll-runs"],
    queryFn: () => base44.entities.PayrollRun.list("month"),
    staleTime: 0,
  });
  const finalRunIds = runs.filter((r) => FINAL_RUN_STATUSES.includes(r.status)).map((r) => r.id).sort();
  const { data: payslips = [], isLoading: loadingSlips } = useQuery({
    queryKey: ["payslips", "runs", finalRunIds.join(",")],
    queryFn: () => base44.entities.Payslip.filter({ run_id: finalRunIds }),
    enabled: finalRunIds.length > 0,
    staleTime: 0,
  });
  const { data: payslipProjects = [], isLoading: loadingAlloc } = useQuery({
    queryKey: ["payslip-projects", "project", project.id],
    queryFn: () => base44.entities.PayslipProject.filter({ project_id: project.id }),
    staleTime: 0,
  });

  const isLoading = loadingTS || loadingCosts || loadingRuns || loadingSlips || loadingAlloc;

  // D8: ostaje nama = prihod − trošak radnika − ostali troškovi projekta (EUR, uključeni preračunati RSD).
  // RSD trošak bez kursa (stari red) nije oduzet — ni kao 0 ni kao RSD — i prikazuje se uz napomenu „nedostaje kurs".
  const report = projectFinancialReport({
    projectId: project.id,
    timesheets: allTimesheets,
    costs,
    runs,
    payslips,
    payslipProjects,
  });
  const { totals, months, employees: employeeRows, pending, problems } = report;
  const totalRevenue = totals.revenue;
  const totalWorkerCost = totals.laborCost;
  const totalHours = totals.hours;
  const grossProfit = totals.remaining;
  const profitMargin = totals.marginPct ?? 0;
  const laborProfit = totals.laborDifference;
  const costsEUR = report.costs.eur;
  const costsFromRsd = report.costs.fromRsd;
  const costsMissingRsd = report.costs.missingRsd;
  const hasEstimate = totals.hasEstimate;

  // Cost breakdown by category — EUR zbir po kategoriji (isti helper), RSD bez kursa posebno.
  const categoryCosts = {};
  costs.forEach((c) => {
    const key = c.category || t("Uncategorized", "Nekategorisano");
    (categoryCosts[key] ||= []).push(c);
  });
  const categoryTotals = Object.fromEntries(Object.entries(categoryCosts).map(([key, list]) => {
    const s = sumCostsEur(list);
    return [key, { eur: s.total, missingRsd: s.missingByCurrency.RSD || 0 }];
  }));

  const getCategoryLabel = (key) => {
    const found = costCategories.find((c) => c.name.toLowerCase() === key?.toLowerCase());
    if (found) return lang === "rs" ? (found.translation || found.name) : found.name;
    return key;
  };

  const monthLabel = (month) => formatDate(parseISO(month), "LLLL yyyy", lang).replace(/^./, (c) => c.toUpperCase());
  // <span> (ne Badge/<div>), jer stoji i unutar <p>.
  const estimateBadge = (
    <span className={cn(badgeVariants({ variant: "outline" }), "ml-1 px-1.5 py-0 text-[10px] font-medium border-amber-300 text-amber-700 dark:text-amber-400")}>
      {t("estimate", "procena")}
    </span>
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t("Revenue (B2B)", "Prihod (B2B)")}</p>
              <p className="text-lg font-bold text-green-600">{totalRevenue.toFixed(2)} €</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
              <TrendingDown className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">
                {t("Worker Costs", "Troškovi radnika")}{hasEstimate && estimateBadge}
              </p>
              <p className="text-lg font-bold text-orange-600">{totalWorkerCost.toFixed(2)} €</p>
              {totals.payrollLaborCost > 0 && (
                <p className="text-xs text-muted-foreground">{t("from payroll (gross 2)", "iz obračuna (bruto 2)")}: {totals.payrollLaborCost.toFixed(2)} €</p>
              )}
              {hasEstimate && totals.payrollLaborCost > 0 && (
                <p className="text-xs text-amber-600">{t("estimate", "procena")}: {totals.estimatedLaborCost.toFixed(2)} €</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t("Project Costs", "Projektni troškovi")}</p>
              {costs.length > 0 && <p className="text-base font-bold text-red-600">{costsEUR.toFixed(2)} €</p>}
              {costsFromRsd.amount > 0 && (
                <p className="text-xs text-muted-foreground">{t("incl.", "uklj.")} {costsFromRsd.amount.toFixed(2)} RSD = {costsFromRsd.eur.toFixed(2)} €</p>
              )}
              {costsMissingRsd > 0 && (
                <p className="text-xs font-semibold text-red-500">{costsMissingRsd.toFixed(2)} RSD · {t("missing exchange rate", "nedostaje kurs")}</p>
              )}
              {costs.length === 0 && <p className="text-base font-bold text-muted-foreground">—</p>}
            </div>
          </div>
        </Card>

        <Card className={`p-4 ${grossProfit >= 0 ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800"}`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${grossProfit >= 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
              <DollarSign className={`w-4 h-4 ${grossProfit >= 0 ? "text-green-600" : "text-red-600"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">
                {t("Remaining (after all costs)", "Ostaje nama (posle svih troškova)")}{hasEstimate && estimateBadge}
              </p>
              <p className={`text-lg font-bold ${grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {grossProfit.toFixed(2)} €
              </p>
              {totalRevenue > 0 && (
                <p className="text-xs text-muted-foreground">{profitMargin.toFixed(1)}% · {t("before project costs", "pre troškova projekta")}: {laborProfit.toFixed(2)} €</p>
              )}
              {costsMissingRsd > 0 && (
                <p className="text-xs text-amber-600">{t(`RSD costs (${costsMissingRsd.toFixed(2)}) not deducted — missing exchange rate`, `RSD troškovi (${costsMissingRsd.toFixed(2)}) nisu oduzeti — nedostaje kurs`)}</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {pending.count > 0 && (
        <p className="text-xs text-muted-foreground">
          {t(`Not approved yet (not included): ${pending.count} entries, ${pending.hours.toFixed(1)} h`,
             `Još nije odobreno (nije uračunato): ${pending.count} unosa, ${pending.hours.toFixed(1)} h`)}
        </p>
      )}

      {problems.length > 0 && (
        <Card className="p-4 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="font-semibold text-sm">{t("Check before relying on these numbers", "Proverite pre nego što se oslonite na brojke")}</h3>
          </div>
          <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300 list-disc pl-5">
            {problems.map((p, i) => <li key={`${p.code}-${p.timesheetId || p.month}-${i}`}>{reportProblemMessage(p, lang === "rs" ? "rs" : "en")}</li>)}
          </ul>
        </Card>
      )}

      {/* Hours summary */}
      {totalHours > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">{t("Hours Summary", "Pregled sati")}</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">{totalHours.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">{t("Total Hours", "Ukupno sati")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{totals.count}</p>
              <p className="text-xs text-muted-foreground">{t("Timesheet Entries", "Unosa")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {totalHours > 0 ? (totalRevenue / totalHours).toFixed(2) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{t("Avg €/h (B2B)", "Prosek €/h (B2B)")}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Po mesecima: trošak radnika iz odobrenog obračuna (bruto 2) ili procena */}
      {months.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">{t("By Month", "Po mesecima")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs text-muted-foreground font-medium border-b">
                  <th className="text-left font-medium pb-2">{t("Month", "Mesec")}</th>
                  <th className="text-left font-medium pb-2">{t("Payroll", "Obračun")}</th>
                  <th className="text-right font-medium pb-2">{t("Hours", "Sati")}</th>
                  <th className="text-right font-medium pb-2">{t("Revenue (B2B)", "Prihod (B2B)")}</th>
                  <th className="text-right font-medium pb-2">{t("Worker Costs", "Troškovi radnika")}</th>
                  <th className="text-right font-medium pb-2">{t("Revenue − workers", "Prihod − radnici")}</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month} className="border-b last:border-0">
                    <td className="py-2 font-medium">{monthLabel(m.month)}</td>
                    <td className="py-2">
                      {m.runStatus ? <StatusBadge status={m.runStatus} /> : <span className="text-xs text-muted-foreground">{t("none", "nema")}</span>}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">{m.hours.toFixed(1)}h</td>
                    <td className="py-2 text-right text-green-600 font-semibold">{m.revenue.toFixed(2)} €</td>
                    <td className="py-2 text-right text-orange-600 font-semibold whitespace-nowrap">
                      {m.laborCost.toFixed(2)} €{m.estimate && estimateBadge}
                    </td>
                    <td className={`py-2 text-right font-semibold ${m.difference >= 0 ? "text-green-600" : "text-red-600"}`}>{m.difference.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasEstimate && (
            <p className="text-xs text-muted-foreground mt-3">
              {t("Estimate: month without an approved payroll — worker cost is the amount of approved timesheets (hours × worker rate), without taxes and contributions. The final cost (gross 2) comes from the approved monthly payroll.",
                 "Procena: mesec bez odobrenog obračuna — trošak radnika je iznos odobrenih satnica (sati × satnica radnika), bez poreza i doprinosa. Konačan trošak (bruto 2) daje odobren mesečni obračun.")}
            </p>
          )}
        </Card>
      )}

      {/* Employee breakdown */}
      {employeeRows.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">{t("Employee Earnings", "Zarada radnika")}</h3>
          </div>
          <div className="space-y-0">
            <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground font-medium pb-2 border-b">
              <span>{t("Employee", "Radnik")}</span>
              <span className="text-right">{t("Hours", "Sati")}</span>
              <span className="text-right">{t("Worker cost", "Trošak radnika")}</span>
              <span className="text-right">{t("Revenue (B2B)", "Prihod (B2B)")}</span>
            </div>
            {employeeRows.map((row) => (
              <div key={row.key} className="grid grid-cols-4 gap-2 py-2 border-b last:border-0 text-sm">
                <span className="font-medium truncate">{row.name || "—"}</span>
                <span className="text-right text-muted-foreground">{row.hours.toFixed(1)}h</span>
                <span className="text-right text-orange-600 font-semibold">{row.laborCost.toFixed(2)} €{row.estimate && estimateBadge}</span>
                <span className="text-right text-green-600 font-semibold">{row.revenue.toFixed(2)} €</span>
              </div>
            ))}
            <div className="grid grid-cols-4 gap-2 pt-2 text-sm font-bold">
              <span>{t("Total", "Ukupno")}</span>
              <span className="text-right text-primary">{totalHours.toFixed(1)}h</span>
              <span className="text-right text-orange-600">{totalWorkerCost.toFixed(2)} €</span>
              <span className="text-right text-green-600">{totalRevenue.toFixed(2)} €</span>
            </div>
          </div>
        </Card>
      )}

      {/* Cost breakdown by category */}
      {costs.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">{t("Cost Breakdown", "Pregled troškova po kategoriji")}</h3>
          </div>
          <div className="space-y-2">
            {Object.entries(categoryTotals).map(([cat, vals]) => (
              <div key={cat} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm font-medium">{getCategoryLabel(cat)}</span>
                <div className="text-right">
                  <span className="text-sm font-semibold text-primary">{vals.eur.toFixed(2)} €</span>
                  {vals.missingRsd > 0 && <span className="text-sm text-muted-foreground mx-1">·</span>}
                  {vals.missingRsd > 0 && (
                    <span className="text-sm font-semibold text-amber-600">{vals.missingRsd.toFixed(2)} RSD ({t("missing exchange rate", "nedostaje kurs")})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {totalRevenue === 0 && costs.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {t("No financial data available for this project.", "Nema finansijskih podataka za ovaj projekat.")}
          </p>
        </Card>
      )}
    </div>
  );
}
