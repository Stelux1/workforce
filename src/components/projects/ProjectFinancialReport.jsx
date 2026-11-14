import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Receipt, BarChart2, Users } from "lucide-react";
import { useLang } from "@/lib/LanguageContext";
import { projectMargin } from "@/lib/payroll/monthly";
import { sum2 } from "@/lib/payroll/money";

export default function ProjectFinancialReport({ project }) {
  const { lang } = useLang();
  const t = (en, rs) => lang === "rs" ? rs : en;

  // Po ID-u projekta (ne po imenu) i sve satnice — odobrene ulaze u novac, ostale se samo prikazuju (QA 14.11.2026).
  const { data: allTimesheets = [], isLoading: loadingTS } = useQuery({
    queryKey: ["timesheets", "project", project.id],
    queryFn: () => base44.entities.Timesheet.filter({ project_id: project.id }, "-week_start"),
  });
  const timesheets = allTimesheets.filter((ts) => ts.approval_status === "approved");
  const pending = allTimesheets.filter((ts) => ts.approval_status !== "approved");
  const pendingHours = pending.reduce((sum, ts) => sum + (ts.total_hours || 0), 0);

  const { data: costs = [], isLoading: loadingCosts } = useQuery({
    queryKey: ["project-costs", project.id],
    queryFn: () => base44.entities.ProjectCost.filter({ project_id: project.id }, "-created_date"),
  });

  const { data: costCategories = [] } = useQuery({
    queryKey: ["cost-categories"],
    queryFn: () => base44.entities.CostCategory.list("name", 200),
  });

  const isLoading = loadingTS || loadingCosts;

  // Revenue from timesheets (client_revenue = hours * b2b_rate)
  const totalRevenue = sum2(timesheets.map((ts) => ts.client_revenue || 0));
  const totalWorkerCost = sum2(timesheets.map((ts) => ts.worker_cost || 0));
  const totalHours = timesheets.reduce((sum, ts) => sum + (ts.total_hours || 0), 0);

  // Project costs per currency
  const costsEUR = costs.filter(c => (c.currency || "EUR") === "EUR").reduce((sum, c) => sum + (c.amount || 0), 0);
  const costsRSD = costs.filter(c => c.currency === "RSD").reduce((sum, c) => sum + (c.amount || 0), 0);

  // D8: ostaje nama = prihod − trošak radnika − ostali troškovi projekta (EUR). RSD troškovi nemaju kurs (D2) i
  // prikazuju se odvojeno, uz napomenu da nisu oduzeti.
  const grossProfit = projectMargin({ revenue: totalRevenue, laborCost: totalWorkerCost, otherCosts: costsEUR }).remaining;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const laborProfit = totalRevenue - totalWorkerCost;

  // Per-employee breakdown
  const employeeMap = {};
  timesheets.forEach((ts) => {
    const key = ts.employee_id || ts.employee_name || "?";
    if (!employeeMap[key]) employeeMap[key] = { name: ts.employee_name || key, hours: 0, workerCost: 0, revenue: 0 };
    employeeMap[key].hours += ts.total_hours || 0;
    employeeMap[key].workerCost += ts.worker_cost || 0;
    employeeMap[key].revenue += ts.client_revenue || 0;
  });
  const employeeRows = Object.values(employeeMap).sort((a, b) => b.hours - a.hours);

  // Cost breakdown by category
  const categoryTotals = {};
  costs.forEach((c) => {
    const key = c.category || t("Uncategorized", "Nekategorisano");
    if (!categoryTotals[key]) categoryTotals[key] = { eur: 0, rsd: 0 };
    if ((c.currency || "EUR") === "EUR") categoryTotals[key].eur += c.amount || 0;
    else categoryTotals[key].rsd += c.amount || 0;
  });

  const getCategoryLabel = (key) => {
    const found = costCategories.find((c) => c.name.toLowerCase() === key?.toLowerCase());
    if (found) return lang === "rs" ? (found.translation || found.name) : found.name;
    return key;
  };

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
              <p className="text-xs text-muted-foreground mb-0.5">{t("Worker Costs", "Troškovi radnika")}</p>
              <p className="text-lg font-bold text-orange-600">{totalWorkerCost.toFixed(2)} €</p>
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
              <p className="text-xs text-muted-foreground mb-0.5">{t("Remaining (after all costs)", "Ostaje nama (posle svih troškova)")}</p>
              <p className={`text-lg font-bold ${grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {grossProfit.toFixed(2)} €
              </p>
              {totalRevenue > 0 && (
                <p className="text-xs text-muted-foreground">{profitMargin.toFixed(1)}% · {t("before project costs", "pre troškova projekta")}: {laborProfit.toFixed(2)} €</p>
              )}
              {costsRSD > 0 && (
                <p className="text-xs text-amber-600">{t(`RSD costs (${costsRSD.toFixed(2)}) not deducted — no exchange rate`, `RSD troškovi (${costsRSD.toFixed(2)}) nisu oduzeti — nema kursa`)}</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {pending.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t(`Not approved yet (not included): ${pending.length} entries, ${pendingHours.toFixed(1)} h`,
             `Još nije odobreno (nije uračunato): ${pending.length} unosa, ${pendingHours.toFixed(1)} h`)}
        </p>
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
              <p className="text-2xl font-bold">{timesheets.length}</p>
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
              <span className="text-right">{t("Cost (B2C)", "Trošak (B2C)")}</span>
              <span className="text-right">{t("Revenue (B2B)", "Prihod (B2B)")}</span>
            </div>
            {employeeRows.map((row) => (
              <div key={row.name} className="grid grid-cols-4 gap-2 py-2 border-b last:border-0 text-sm">
                <span className="font-medium truncate">{row.name}</span>
                <span className="text-right text-muted-foreground">{row.hours.toFixed(1)}h</span>
                <span className="text-right text-orange-600 font-semibold">{row.workerCost.toFixed(2)} €</span>
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
                  {vals.eur > 0 && <span className="text-sm font-semibold text-primary">{vals.eur.toFixed(2)} €</span>}
                  {vals.eur > 0 && vals.rsd > 0 && <span className="text-sm text-muted-foreground mx-1">·</span>}
                  {vals.rsd > 0 && <span className="text-sm font-semibold text-amber-600">{vals.rsd.toFixed(2)} RSD</span>}
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