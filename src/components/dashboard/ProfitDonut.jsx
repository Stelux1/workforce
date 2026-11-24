import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/translations";
import { CHART_COLORS, formatMargin, formatMoney } from "./format";

/** `kpi` = byCurrency[valuta] iz financialSummary (laborRevenue, payrollCost, additionalCosts, netProfit, profitMargin). */
export default function ProfitDonut({ kpi, currency = "EUR" }) {
  const t = useT();
  const revenue = kpi?.laborRevenue ?? 0;
  const positive = Math.max(kpi?.netProfit ?? 0, 0);
  const cost = Math.max(revenue - positive, 0);
  const empty = revenue <= 0;
  const data = empty ? [{ v: 1, color: "#EDE9FE" }] : [{ v: positive, color: "#7C3AED" }, { v: cost, color: CHART_COLORS.cost }];

  const rows = [
    { label: "Client Revenue", value: kpi?.laborRevenue ?? 0, color: CHART_COLORS.revenue },
    { label: "Payroll Cost", value: kpi?.payrollCost ?? 0, color: CHART_COLORS.cost },
    { label: "Additional Project Costs", value: kpi?.additionalCosts ?? 0, color: "#F59E0B" },
    { label: "Project Profit", value: kpi?.netProfit ?? 0, color: CHART_COLORS.profit },
  ];

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{t("Profitability Overview")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-center gap-6 pt-2">
        <div className="relative w-[160px] h-[160px] shrink-0">
          <PieChart width={160} height={160}>
            <Pie data={data} dataKey="v" innerRadius={56} outerRadius={78} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tracking-tight">{formatMargin(kpi?.profitMargin)}</span>
            <span className="text-xs text-muted-foreground">{t("Profit Margin")}</span>
          </div>
        </div>
        <ul className="space-y-3 text-sm min-w-[190px]">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: r.color }} />
                {t(r.label)}
              </span>
              <span className="font-semibold">{formatMoney(r.value, currency)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
